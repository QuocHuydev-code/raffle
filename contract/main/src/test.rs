#![cfg(test)]

use super::{Error, RaffleHub, RaffleHubClient, Status};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    Address, Bytes, BytesN, Env, String,
};

const PRIZE: i128 = 1_000_000_000;
const TICKET_PRICE: i128 = 10_000_000;
const DURATION: u64 = 86_400;

fn make_secret(env: &Env) -> Bytes {
    Bytes::from_array(env, &[42u8; 32])
}

fn setup<'a>() -> (Env, RaffleHubClient<'a>, StellarAssetClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let issuer = Address::generate(&env);
    let xlm_sac = env.register_stellar_asset_contract_v2(issuer);
    let xlm_addr = xlm_sac.address();
    let xlm_admin = StellarAssetClient::new(&env, &xlm_addr);

    let id = env.register(RaffleHub, (xlm_addr,));
    (env.clone(), RaffleHubClient::new(&env, &id), xlm_admin)
}

fn open_raffle<'a>(
    c: &RaffleHubClient<'a>,
    env: &Env,
    xlm_admin: &StellarAssetClient<'a>,
    creator: &Address,
) -> u32 {
    xlm_admin.mint(creator, &PRIZE);
    let secret = make_secret(env);
    let hash = BytesN::<32>::from(env.crypto().sha256(&secret));
    let title = String::from_str(env, "Test Raffle");
    c.create(
        creator,
        &title,
        &PRIZE,
        &TICKET_PRICE,
        &(env.ledger().timestamp() + DURATION),
        &hash,
    )
}

fn advance(env: &Env, seconds: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(seconds);
    });
}

#[test]
fn create_assigns_sequential_ids() {
    let (env, c, xlm_admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let id1 = open_raffle(&c, &env, &xlm_admin, &alice);
    let id2 = open_raffle(&c, &env, &xlm_admin, &bob);
    assert_eq!(id1, 0);
    assert_eq!(id2, 1);
    assert_eq!(c.next_id(), 2);
}

#[test]
fn buy_ticket_records_buyer() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);

    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);

    let n = c.buy_ticket(&alice, &id);
    assert_eq!(n, 1);
    let r = c.raffle(&id).unwrap();
    assert_eq!(r.ticket_count, 1);
}

#[test]
fn multiple_buyers_grow_pool() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    xlm_admin.mint(&alice, &(2 * TICKET_PRICE));
    xlm_admin.mint(&bob, &TICKET_PRICE);

    c.buy_ticket(&alice, &id);
    c.buy_ticket(&alice, &id);
    c.buy_ticket(&bob, &id);

    let r = c.raffle(&id).unwrap();
    assert_eq!(r.ticket_count, 3);
}

#[test]
fn buy_after_deadline_blocked() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);

    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    advance(&env, DURATION + 1);

    let r = c.try_buy_ticket(&alice, &id);
    assert!(matches!(r, Err(Ok(Error::DeadlinePassed))));
}

#[test]
fn draw_before_deadline_blocked() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);
    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    c.buy_ticket(&alice, &id);

    let r = c.try_draw(&creator, &id, &make_secret(&env));
    assert!(matches!(r, Err(Ok(Error::DeadlineNotPassed))));
}

#[test]
fn draw_with_wrong_secret_blocked() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);
    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    c.buy_ticket(&alice, &id);
    advance(&env, DURATION + 1);

    let wrong = Bytes::from_array(&env, &[1u8; 32]);
    let r = c.try_draw(&creator, &id, &wrong);
    assert!(matches!(r, Err(Ok(Error::BadSecret))));
}

#[test]
fn draw_with_no_tickets_blocked() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);
    advance(&env, DURATION + 1);

    let r = c.try_draw(&creator, &id, &make_secret(&env));
    assert!(matches!(r, Err(Ok(Error::NoTickets))));
}

#[test]
fn draw_picks_winner_from_pool() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    xlm_admin.mint(&bob, &TICKET_PRICE);
    c.buy_ticket(&alice, &id);
    c.buy_ticket(&bob, &id);

    advance(&env, DURATION + 1);
    let winner = c.draw(&creator, &id, &make_secret(&env));

    assert!(winner == alice || winner == bob);
    let r = c.raffle(&id).unwrap();
    assert_eq!(r.status, Status::Drawn);
    assert_eq!(r.winner, winner);
}

#[test]
fn cannot_draw_twice() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);
    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    c.buy_ticket(&alice, &id);
    advance(&env, DURATION + 1);
    c.draw(&creator, &id, &make_secret(&env));

    let r = c.try_draw(&creator, &id, &make_secret(&env));
    assert!(matches!(r, Err(Ok(Error::AlreadyDrawn))));
}

#[test]
fn non_creator_cannot_draw() {
    let (env, c, xlm_admin) = setup();
    let creator = Address::generate(&env);
    let id = open_raffle(&c, &env, &xlm_admin, &creator);
    let stranger = Address::generate(&env);
    let alice = Address::generate(&env);
    xlm_admin.mint(&alice, &TICKET_PRICE);
    c.buy_ticket(&alice, &id);
    advance(&env, DURATION + 1);

    let r = c.try_draw(&stranger, &id, &make_secret(&env));
    assert!(matches!(r, Err(Ok(Error::NotCreator))));
}

#[test]
fn two_raffles_are_independent() {
    let (env, c, xlm_admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let id_a = open_raffle(&c, &env, &xlm_admin, &alice);
    let id_b = open_raffle(&c, &env, &xlm_admin, &bob);

    let buyer = Address::generate(&env);
    xlm_admin.mint(&buyer, &(2 * TICKET_PRICE));
    c.buy_ticket(&buyer, &id_a);
    c.buy_ticket(&buyer, &id_b);

    assert_eq!(c.raffle(&id_a).unwrap().ticket_count, 1);
    assert_eq!(c.raffle(&id_b).unwrap().ticket_count, 1);
}
