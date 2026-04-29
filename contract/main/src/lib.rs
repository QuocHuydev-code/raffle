#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token,
    Address, Bytes, BytesN, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AmountMustBePositive = 2,
    DeadlinePassed = 3,
    DeadlineNotPassed = 4,
    AlreadyDrawn = 5,
    NoTickets = 6,
    BadSecret = 7,
    NotCreator = 8,
    NotFound = 9,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Selling = 0,
    Drawn = 1,
}

#[contracttype]
#[derive(Clone)]
pub struct Raffle {
    pub creator: Address,
    pub title: String,
    pub prize: i128,
    pub ticket_price: i128,
    pub deadline: u64,
    pub secret_hash: BytesN<32>,
    pub status: Status,
    pub ticket_count: u32,
    pub winner: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Xlm,
    NextId,
    Raffle(u32),
    Tickets(u32),
}

fn xlm_client(env: &Env) -> Result<token::Client<'_>, Error> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::Xlm)
        .ok_or(Error::NotInitialized)?;
    Ok(token::Client::new(env, &addr))
}

#[contract]
pub struct RaffleHub;

#[contractimpl]
impl RaffleHub {
    pub fn __constructor(env: Env, xlm: Address) {
        env.storage().instance().set(&DataKey::Xlm, &xlm);
        env.storage().instance().set(&DataKey::NextId, &0u32);
    }

    pub fn create(
        env: Env,
        creator: Address,
        title: String,
        prize_xlm: i128,
        ticket_price: i128,
        deadline: u64,
        secret_hash: BytesN<32>,
    ) -> Result<u32, Error> {
        creator.require_auth();
        if prize_xlm < 0 || ticket_price < 0 {
            return Err(Error::AmountMustBePositive);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::DeadlinePassed);
        }

        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let zero_winner = creator.clone();
        let raffle = Raffle {
            creator: creator.clone(),
            title: title.clone(),
            prize: prize_xlm,
            ticket_price,
            deadline,
            secret_hash,
            status: Status::Selling,
            ticket_count: 0,
            winner: zero_winner,
        };
        env.storage().persistent().set(&DataKey::Raffle(id), &raffle);
        let empty: Vec<Address> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::Tickets(id), &empty);

        if prize_xlm > 0 {
            let t = token::Client::new(&env, &xlm_addr(&env)?);
            t.transfer(&creator, &env.current_contract_address(), &prize_xlm);
        }

        env.events().publish(
            (symbol_short!("create"), creator, id),
            (prize_xlm, ticket_price, deadline),
        );
        Ok(id)
    }

    pub fn buy_ticket(env: Env, buyer: Address, raffle_id: u32) -> Result<u32, Error> {
        buyer.require_auth();
        let mut raffle: Raffle = env
            .storage()
            .persistent()
            .get(&DataKey::Raffle(raffle_id))
            .ok_or(Error::NotFound)?;
        if raffle.status != Status::Selling {
            return Err(Error::AlreadyDrawn);
        }
        if env.ledger().timestamp() >= raffle.deadline {
            return Err(Error::DeadlinePassed);
        }

        let mut tickets: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Tickets(raffle_id))
            .unwrap_or_else(|| Vec::new(&env));
        tickets.push_back(buyer.clone());
        let len = tickets.len();
        env.storage()
            .persistent()
            .set(&DataKey::Tickets(raffle_id), &tickets);

        raffle.ticket_count = len;
        env.storage()
            .persistent()
            .set(&DataKey::Raffle(raffle_id), &raffle);

        if raffle.ticket_price > 0 {
            let t = xlm_client(&env)?;
            t.transfer(&buyer, &env.current_contract_address(), &raffle.ticket_price);
        }

        env.events()
            .publish((symbol_short!("ticket"), buyer, raffle_id), len);
        Ok(len)
    }

    pub fn draw(
        env: Env,
        creator: Address,
        raffle_id: u32,
        secret: Bytes,
    ) -> Result<Address, Error> {
        creator.require_auth();
        let mut raffle: Raffle = env
            .storage()
            .persistent()
            .get(&DataKey::Raffle(raffle_id))
            .ok_or(Error::NotFound)?;
        if raffle.creator != creator {
            return Err(Error::NotCreator);
        }
        if raffle.status != Status::Selling {
            return Err(Error::AlreadyDrawn);
        }
        if env.ledger().timestamp() < raffle.deadline {
            return Err(Error::DeadlineNotPassed);
        }
        let computed = env.crypto().sha256(&secret);
        if BytesN::<32>::from(computed) != raffle.secret_hash {
            return Err(Error::BadSecret);
        }

        let tickets: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Tickets(raffle_id))
            .unwrap_or_else(|| Vec::new(&env));
        let count = tickets.len();
        if count == 0 {
            return Err(Error::NoTickets);
        }

        // mix the secret with the ticket count to derive a deterministic index
        let mut mix = Bytes::new(&env);
        mix.append(&secret);
        let count_bytes: [u8; 4] = count.to_be_bytes();
        mix.extend_from_slice(&count_bytes);
        let derived = env.crypto().sha256(&mix);
        let bytes_array = derived.to_array();
        let mut idx_u32: u32 = 0;
        idx_u32 |= bytes_array[28] as u32;
        idx_u32 = (idx_u32 << 8) | bytes_array[29] as u32;
        idx_u32 = (idx_u32 << 8) | bytes_array[30] as u32;
        idx_u32 = (idx_u32 << 8) | bytes_array[31] as u32;
        let winner_idx = idx_u32 % count;

        let winner = tickets.get(winner_idx).expect("winner exists");
        raffle.status = Status::Drawn;
        raffle.winner = winner.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Raffle(raffle_id), &raffle);

        let total = raffle.prize + raffle.ticket_price * (count as i128);
        if total > 0 {
            let t = xlm_client(&env)?;
            t.transfer(&env.current_contract_address(), &winner, &total);
        }

        env.events().publish(
            (symbol_short!("draw"), winner.clone(), raffle_id),
            (total, winner_idx),
        );
        Ok(winner)
    }

    pub fn raffle(env: Env, id: u32) -> Option<Raffle> {
        env.storage().persistent().get(&DataKey::Raffle(id))
    }

    pub fn next_id(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn tickets_for(env: Env, id: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Tickets(id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn xlm_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Xlm)
            .ok_or(Error::NotInitialized)
    }
}

fn xlm_addr(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Xlm)
        .ok_or(Error::NotInitialized)
}

#[cfg(test)]
mod test;
