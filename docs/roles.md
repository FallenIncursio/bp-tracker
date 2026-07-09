# Roles

The app uses one global admin model and clan-scoped roles. This is important for multi-clan operation: an admiral in clan A must not manage clan B.

## Role List

| Role | Scope | Summary |
| --- | --- | --- |
| `ADMIN` | Global | Full access to the app, clans, users, master data, and setup. |
| `ADMIRAL` | Clan | Clan management without global admin permissions. |
| `COMMANDER` | Clan | Operational management of registrations and Sirius data. |
| `MEMBER` | Clan | Can edit own blueprint status values and read clan data. |
| Guest | Public | Read-only access without login. |

## Permission Matrix

| Action | Guest | Member | Commander | Admiral | Admin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Read clans and public data | Yes | Yes | Yes | Yes | Yes |
| See member names | Yes | Yes | Yes | Yes | Yes |
| Edit own blueprint status | No | Yes | Yes | Yes | Yes |
| Change own account data | No | Yes | Yes | Yes | Yes |
| Approve member registration | No | No | Yes | Yes | Yes |
| Edit Sirius planets and slots | No | No | Yes | Yes | Yes |
| Configure clan Discord channels | No | No | No | Yes | Yes |
| Manage commanders and members | No | No | No | Yes | Yes |
| Promote or demote admirals | No | No | No | No | Yes |
| Manage global admins | No | No | No | No | Yes |
| Change global master data | No | No | No | No | Yes |

## Registration

1. A user registers with password login or Discord.
2. If a clan was selected, a `PENDING` membership is created.
3. A commander, admiral, or admin reviews the registration.
4. After approval, the membership becomes `ACTIVE`.

Without an active membership, a user is not counted as a clan member.

## Delegation

Admirals are intentionally close to admins, but clan-scoped:

- They cannot create global admins.
- They cannot promote or demote other admirals.
- They cannot edit other clans.

Commanders are intended for ongoing operations:

- approving registrations
- maintaining Sirius rotation
- entering blueprint slots for planets

Members intentionally have only self-service write access:

- own blueprint status values
- own wanted list entries
- own account and password data

## Discord

Discord linking is an account property. Discord notifications additionally depend on:

- user preference
- linked Discord ID
- clan Discord notification channel
- notification event

Admins and admirals configure clan notification and status channels. Users decide whether Discord notifications are enabled for their account.

The Discord status channel is clan-scoped as well. It publishes maintained roadmap and Sirius overview messages without pinging users, even when linked Discord users are shown for wanted blueprint hits.
