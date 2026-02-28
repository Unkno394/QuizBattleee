from __future__ import annotations

from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

def utc_now() -> datetime:
    """Return current UTC time."""
    return datetime.now(timezone.utc)

from .database import get_db_pool


def _effective_profile_frame_sql(alias: str) -> str:
    return f"""
COALESCE(
  {alias}.profile_frame,
  (
    SELECT ui.item_id
    FROM auth_user_inventory ui
    WHERE ui.user_id = {alias}.id
      AND ui.item_id LIKE 'profile_frame_%'
    ORDER BY ui.created_at DESC
    LIMIT 1
  )
)
""".strip()


USER_SELECT = f"""
SELECT
  id,
  email,
  display_name,
  password_hash,
  avatar_url,
  preferred_mascot,
  coins,
  {_effective_profile_frame_sql("auth_users")} AS profile_frame,
  equipped_cat_skin,
  equipped_dog_skin,
  equipped_victory_front_effect,
  equipped_victory_back_effect,
  is_email_verified,
  created_at,
  last_login_at
FROM auth_users
"""


async def get_user_by_email(email: str):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            {USER_SELECT}
            WHERE email = $1
            """,
            email,
        )


async def get_user_by_id(user_id: int):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            {USER_SELECT}
            WHERE id = $1
            """,
            int(user_id),
        )


async def upsert_pending_user(email: str, display_name: str, password_hash: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth_users (email, display_name, password_hash, is_email_verified)
            VALUES ($1, $2, $3, FALSE)
            ON CONFLICT (email) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                password_hash = EXCLUDED.password_hash,
                updated_at = NOW()
            """,
            email,
            display_name,
            password_hash,
        )


async def mark_email_verified(email: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_users
            SET is_email_verified = TRUE,
                updated_at = NOW()
            WHERE email = $1
            """,
            email,
        )


async def upsert_email_code(email: str, purpose: str, code: str, expires_at: datetime) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth_email_codes (email, purpose, code, expires_at, last_sent_at, consumed_at, created_at)
            VALUES ($1, $2, $3, $4, NOW(), NULL, NOW())
            ON CONFLICT (email, purpose) DO UPDATE
            SET code = EXCLUDED.code,
                expires_at = EXCLUDED.expires_at,
                last_sent_at = NOW(),
                consumed_at = NULL
            """,
            email,
            purpose,
            code,
            expires_at,
        )


async def get_email_code(email: str, purpose: str):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT code, expires_at, consumed_at, last_sent_at
            FROM auth_email_codes
            WHERE email = $1 AND purpose = $2
            """,
            email,
            purpose,
        )


async def consume_email_code(email: str, purpose: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_email_codes
            SET consumed_at = NOW()
            WHERE email = $1 AND purpose = $2
            """,
            email,
            purpose,
        )


async def update_profile(
    user_id: int,
    display_name: str | None,
    avatar_url: str | None,
    preferred_mascot: str | None,
    update_preferred_mascot: bool,
):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            UPDATE auth_users
            SET display_name = COALESCE($2::text, display_name),
                avatar_url = COALESCE($3::text, avatar_url),
                preferred_mascot = CASE WHEN $4::boolean THEN $5::text ELSE preferred_mascot END,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              display_name,
              password_hash,
              avatar_url,
              preferred_mascot,
              coins,
              {_effective_profile_frame_sql("auth_users")} AS profile_frame,
              equipped_cat_skin,
              equipped_dog_skin,
              equipped_victory_front_effect,
              equipped_victory_back_effect,
              is_email_verified,
              created_at,
              last_login_at
            """,
            int(user_id),
            display_name,
            avatar_url,
            bool(update_preferred_mascot),
            preferred_mascot,
        )


async def update_user_email(user_id: int, new_email: str):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            UPDATE auth_users
            SET email = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              display_name,
              password_hash,
              avatar_url,
              preferred_mascot,
              coins,
              {_effective_profile_frame_sql("auth_users")} AS profile_frame,
              equipped_cat_skin,
              equipped_dog_skin,
              equipped_victory_front_effect,
              equipped_victory_back_effect,
              is_email_verified,
              created_at,
              last_login_at
            """,
            int(user_id),
            new_email,
        )
    return row



async def delete_codes_for_email(email: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            DELETE FROM auth_email_codes
            WHERE email = $1
            """,
            email,
        )


async def update_user_password(user_id: int, new_hash: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_users
            SET password_hash = $2,
                updated_at = NOW()
            WHERE id = $1
            """,
            int(user_id),
            new_hash,
        )


async def touch_last_login(email: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_users
            SET last_login_at = NOW(),
                updated_at = NOW()
            WHERE email = $1
            """,
            email,
        )


async def get_owned_item_ids(user_id: int) -> list[str]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT item_id
            FROM auth_user_inventory
            WHERE user_id = $1
            ORDER BY created_at ASC
            """,
            int(user_id),
        )
    return [str(row["item_id"]) for row in rows]


async def ensure_owned_item_ids(user_id: int, item_ids: list[str] | tuple[str, ...]) -> None:
    normalized_ids = sorted({str(item_id or "").strip() for item_id in item_ids if str(item_id or "").strip()})
    if not normalized_ids:
        return

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO auth_user_inventory (user_id, item_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, item_id) DO NOTHING
            """,
            [(int(user_id), item_id) for item_id in normalized_ids],
        )


async def add_coins(user_id: int, amount: int) -> int:
    normalized_amount = max(0, int(amount))
    if normalized_amount <= 0:
        row = await get_user_by_id(int(user_id))
        return int(row["coins"] or 0) if row else 0

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE auth_users
            SET coins = GREATEST(0, coins + $2),
                updated_at = NOW()
            WHERE id = $1
            RETURNING coins
            """,
            int(user_id),
            normalized_amount,
        )
    return int(row["coins"] or 0) if row else 0


async def add_wins(user_id: int, amount: int = 1) -> int:
    normalized_amount = max(0, int(amount))
    if normalized_amount <= 0:
        row = await get_user_by_id(int(user_id))
        return int(row["wins_total"] or 0) if row and "wins_total" in row else 0

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE auth_users
            SET wins_total = GREATEST(0, wins_total + $2),
                updated_at = NOW()
            WHERE id = $1
            RETURNING wins_total
            """,
            int(user_id),
            normalized_amount,
        )
    next_total = int(row["wins_total"] or 0) if row else 0
    logger.warning(
        "wins_total updated user_id=%s amount=%s wins_total=%s",
        int(user_id),
        normalized_amount,
        next_total,
    )
    return next_total


async def claim_quick_game_reward(user_id: int, token_hash: str, amount: int) -> dict[str, int | bool]:
    normalized_token_hash = str(token_hash or "").strip()[:64]
    normalized_amount = max(0, int(amount))
    if not normalized_token_hash:
        row = await get_user_by_id(int(user_id))
        return {
            "ok": False,
            "coins": int(row["coins"] or 0) if row else 0,
            "awarded": 0,
        }

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            inserted = await conn.fetchval(
                """
                INSERT INTO quick_game_reward_claims (user_id, token_hash, coins_awarded)
                VALUES ($1, $2, $3)
                ON CONFLICT (token_hash) DO NOTHING
                RETURNING 1
                """,
                int(user_id),
                normalized_token_hash,
                normalized_amount,
            )

            if not inserted:
                current_coins = await conn.fetchval(
                    "SELECT coins FROM auth_users WHERE id = $1",
                    int(user_id),
                )
                return {
                    "ok": False,
                    "coins": int(current_coins or 0),
                    "awarded": 0,
                }

            row = await conn.fetchrow(
                """
                UPDATE auth_users
                SET coins = GREATEST(0, coins + $2),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING coins
                """,
                int(user_id),
                normalized_amount,
            )

    return {
        "ok": True,
        "coins": int(row["coins"] or 0) if row else 0,
        "awarded": normalized_amount,
    }


async def buy_market_item(user_id: int, item_id: str, price: int):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            owner = await conn.fetchrow(
                """
                SELECT coins
                FROM auth_users
                WHERE id = $1
                FOR UPDATE
                """,
                int(user_id),
            )
            if owner is None:
                return {"ok": False, "error": "USER_NOT_FOUND"}

            already_owned = await conn.fetchval(
                """
                SELECT 1
                FROM auth_user_inventory
                WHERE user_id = $1 AND item_id = $2
                """,
                int(user_id),
                item_id,
            )
            if already_owned:
                return {"ok": False, "error": "ALREADY_OWNED", "coins": int(owner["coins"] or 0)}

            current_coins = int(owner["coins"] or 0)
            if current_coins < int(price):
                return {"ok": False, "error": "NOT_ENOUGH_COINS", "coins": current_coins}

            await conn.execute(
                """
                UPDATE auth_users
                SET coins = coins - $2,
                    updated_at = NOW()
                WHERE id = $1
                """,
                int(user_id),
                int(price),
            )
            await conn.execute(
                """
                INSERT INTO auth_user_inventory (user_id, item_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, item_id) DO NOTHING
                """,
                int(user_id),
                item_id,
            )
            coins_after = await conn.fetchval(
                "SELECT coins FROM auth_users WHERE id = $1",
                int(user_id),
            )

    return {"ok": True, "coins": int(coins_after or 0)}


async def equip_profile_frame(user_id: int, frame_item_id: str | None):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            UPDATE auth_users
            SET profile_frame = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              display_name,
              password_hash,
              avatar_url,
              coins,
              {_effective_profile_frame_sql("auth_users")} AS profile_frame,
              equipped_cat_skin,
              equipped_dog_skin,
              equipped_victory_front_effect,
              equipped_victory_back_effect,
              is_email_verified,
              created_at,
              last_login_at
            """,
            int(user_id),
            frame_item_id,
        )


async def equip_mascot_skin(user_id: int, mascot_kind: str, item_id: str | None):
    target_column = "equipped_cat_skin" if mascot_kind == "cat" else "equipped_dog_skin"
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            UPDATE auth_users
            SET {target_column} = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              display_name,
              password_hash,
              avatar_url,
              coins,
              {_effective_profile_frame_sql("auth_users")} AS profile_frame,
              equipped_cat_skin,
              equipped_dog_skin,
              equipped_victory_front_effect,
              equipped_victory_back_effect,
              is_email_verified,
              created_at,
              last_login_at
            """,
            int(user_id),
            item_id,
        )


async def equip_victory_effect(user_id: int, layer: str, item_id: str | None):
    target_column = (
        "equipped_victory_front_effect"
        if layer == "front"
        else "equipped_victory_back_effect"
    )
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f"""
            UPDATE auth_users
            SET {target_column} = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              display_name,
              password_hash,
              avatar_url,
              coins,
              {_effective_profile_frame_sql("auth_users")} AS profile_frame,
              equipped_cat_skin,
              equipped_dog_skin,
              equipped_victory_front_effect,
              equipped_victory_back_effect,
              is_email_verified,
              created_at,
              last_login_at
            """,
            int(user_id),
            item_id,
        )


async def get_friend_user_ids(user_id: int) -> list[int]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT
              CASE
                WHEN requester_id = $1 THEN addressee_id
                ELSE requester_id
              END AS friend_id
            FROM auth_friendships
            WHERE status = 'accepted'
              AND (requester_id = $1 OR addressee_id = $1)
            ORDER BY friend_id ASC
            """,
            int(user_id),
        )
    return [int(row["friend_id"]) for row in rows if row["friend_id"] is not None]


async def get_user_wins_leaderboard(
    limit: int = 50,
    only_user_ids: list[int] | None = None,
):
    normalized_limit = max(1, min(200, int(limit or 50)))
    normalized_user_ids: list[int] = []
    if only_user_ids:
        dedup: set[int] = set()
        for raw in only_user_ids:
            try:
                user_id = int(raw)
            except (TypeError, ValueError):
                continue
            if user_id <= 0 or user_id in dedup:
                continue
            dedup.add(user_id)
            normalized_user_ids.append(user_id)
    if only_user_ids is not None and not normalized_user_ids:
        return []

    where_clause = ""
    query_args: list[object] = [normalized_limit]
    if normalized_user_ids:
        where_clause = "WHERE u.id = ANY($2::bigint[])"
        query_args.append(normalized_user_ids)

    query = f"""
        WITH parsed_results AS (
            SELECT
              id,
              winner_team,
              payload_json::jsonb AS payload,
              COALESCE(payload_json::jsonb->>'gameMode', 'classic') AS game_mode
            FROM game_results
        ),
        team_mode_wins AS (
            SELECT
              pr.id AS game_id,
              (ps->>'accountUserId')::bigint AS user_id
            FROM parsed_results pr
            JOIN LATERAL jsonb_array_elements(COALESCE(pr.payload->'playerStats', '[]'::jsonb)) ps ON TRUE
            WHERE pr.game_mode <> 'ffa'
              AND pr.winner_team IN ('A', 'B')
              AND (ps->>'accountUserId') ~ '^[0-9]+$'
              AND ps->>'team' = pr.winner_team
        ),
        ffa_points AS (
            SELECT
              pr.id AS game_id,
              (ps->>'accountUserId')::bigint AS user_id,
              CASE
                WHEN (ps->>'points') ~ '^-?[0-9]+$' THEN (ps->>'points')::int
                ELSE 0
              END AS points
            FROM parsed_results pr
            JOIN LATERAL jsonb_array_elements(COALESCE(pr.payload->'playerStats', '[]'::jsonb)) ps ON TRUE
            WHERE pr.game_mode = 'ffa'
              AND (ps->>'accountUserId') ~ '^[0-9]+$'
        ),
        ffa_max_points AS (
            SELECT game_id, MAX(points) AS max_points
            FROM ffa_points
            GROUP BY game_id
        ),
        ffa_wins AS (
            SELECT fp.game_id, fp.user_id
            FROM ffa_points fp
            JOIN ffa_max_points fm ON fm.game_id = fp.game_id
            WHERE fm.max_points IS NOT NULL
              AND fp.points = fm.max_points
        ),
        all_wins AS (
            SELECT game_id, user_id FROM team_mode_wins
            UNION ALL
            SELECT game_id, user_id FROM ffa_wins
        ),
        wins_per_user AS (
            SELECT user_id, COUNT(*)::int AS wins
            FROM all_wins
            GROUP BY user_id
        )
        SELECT
          u.id,
          u.display_name,
          u.avatar_url,
          {_effective_profile_frame_sql("u")} AS profile_frame,
          GREATEST(COALESCE(u.wins_total, 0), COALESCE(w.wins, 0)) AS wins
        FROM auth_users u
        LEFT JOIN wins_per_user w ON w.user_id = u.id
        {where_clause}
        ORDER BY GREATEST(COALESCE(u.wins_total, 0), COALESCE(w.wins, 0)) DESC, u.display_name ASC, u.id ASC
        LIMIT $1
    """

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *query_args)


async def send_friend_request(requester_id: int, addressee_id: int):
    """Send a friend request from requester to addressee"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Check if already friends or request exists
        existing = await conn.fetchrow(
            """
            SELECT id, requester_id, addressee_id, status, created_at
            FROM auth_friendships
            WHERE (requester_id = $1 AND addressee_id = $2)
               OR (requester_id = $2 AND addressee_id = $1)
            """,
            requester_id,
            addressee_id,
        )

        if existing:
            status = str(existing["status"])
            if status in {"pending", "accepted"}:
                row = dict(existing)
                row["is_existing"] = True
                return row

            # Reactivate declined/other stale relation as a new pending request.
            reactivated = await conn.fetchrow(
                """
                UPDATE auth_friendships
                SET requester_id = $1,
                    addressee_id = $2,
                    status = 'pending',
                    created_at = NOW(),
                    updated_at = NOW()
                WHERE id = $3
                RETURNING id, requester_id, addressee_id, status, created_at
                """,
                requester_id,
                addressee_id,
                existing["id"],
            )
            row = dict(reactivated)
            row["is_existing"] = False
            row["was_reactivated"] = True
            return row

        # Create new friendship with pending status
        created = await conn.fetchrow(
            """
            INSERT INTO auth_friendships (requester_id, addressee_id, status)
            VALUES ($1, $2, 'pending')
            RETURNING id, requester_id, addressee_id, status, created_at
            """,
            requester_id,
            addressee_id,
        )
        row = dict(created)
        row["is_existing"] = False
        return row


async def accept_friend_request(requester_id: int, addressee_id: int):
    """Accept a friend request"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            UPDATE auth_friendships
            SET status = 'accepted', updated_at = NOW()
            WHERE (requester_id = $1 AND addressee_id = $2)
               OR (requester_id = $2 AND addressee_id = $1)
            RETURNING id, requester_id, addressee_id, status, updated_at
            """,
            requester_id,
            addressee_id,
        )


async def decline_friend_request(requester_id: int, addressee_id: int):
    """Decline a friend request"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            UPDATE auth_friendships
            SET status = 'declined', updated_at = NOW()
            WHERE (requester_id = $1 AND addressee_id = $2)
               OR (requester_id = $2 AND addressee_id = $1)
            RETURNING id, requester_id, addressee_id, status, updated_at
            """,
            requester_id,
            addressee_id,
        )


async def remove_friend(user_id: int, friend_id: int):
    """Remove a friend"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            DELETE FROM auth_friendships
            WHERE (requester_id = $1 AND addressee_id = $2)
               OR (requester_id = $2 AND addressee_id = $1)
            """,
            user_id,
            friend_id,
        )


async def get_user_friends(user_id: int):
    """Get all accepted friends for a user"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT 
              u.id,
              u.email,
              u.display_name,
              u.avatar_url,
              u.equipped_cat_skin,
              u.equipped_dog_skin,
              u.preferred_mascot
            FROM auth_friendships af
            JOIN auth_users u ON (
              (af.requester_id = $1 AND u.id = af.addressee_id)
              OR (af.addressee_id = $1 AND u.id = af.requester_id)
            )
            WHERE af.status = 'accepted'
            ORDER BY u.display_name ASC
            """,
            user_id,
        )


async def get_friend_requests(user_id: int):
    """Get pending friend requests for a user"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT 
              af.id,
              af.requester_id,
              u.email,
              u.display_name,
              u.avatar_url,
              u.equipped_cat_skin,
              u.equipped_dog_skin,
              u.preferred_mascot,
              af.created_at
            FROM auth_friendships af
            JOIN auth_users u ON u.id = af.requester_id
            WHERE af.addressee_id = $1 AND af.status = 'pending'
            ORDER BY af.created_at DESC
            """,
            user_id,
        )


async def get_outgoing_friend_requests(user_id: int):
    """Get outgoing pending friend requests for a user"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT
              af.id,
              af.addressee_id AS friend_id,
              u.display_name,
              u.avatar_url,
              af.created_at
            FROM auth_friendships af
            JOIN auth_users u ON u.id = af.addressee_id
            WHERE af.requester_id = $1 AND af.status = 'pending'
            ORDER BY af.created_at DESC
            """,
            user_id,
        )


async def get_friends_leaderboard(user_id: int, limit: int = 50):
    """Get leaderboard for user's friends only"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            WITH user_friends AS (
              SELECT 
                CASE 
                  WHEN requester_id = $1 THEN addressee_id
                  ELSE requester_id
                END as friend_id
              FROM auth_friendships
              WHERE status = 'accepted'
                AND (requester_id = $1 OR addressee_id = $1)
            ),
            parsed_results AS (
              SELECT
                id,
                winner_team,
                payload_json::jsonb AS payload,
                COALESCE(payload_json::jsonb->>'gameMode', 'classic') AS game_mode
              FROM game_results
            ),
            team_mode_wins AS (
              SELECT
                pr.id AS game_id,
                (ps->>'accountUserId')::bigint AS user_id
              FROM parsed_results pr
              JOIN LATERAL jsonb_array_elements(COALESCE(pr.payload->'playerStats', '[]'::jsonb)) ps ON TRUE
              WHERE pr.game_mode <> 'ffa'
                AND pr.winner_team IN ('A', 'B')
                AND (ps->>'accountUserId') ~ '^[0-9]+$'
                AND ps->>'team' = pr.winner_team
            ),
            ffa_points AS (
              SELECT
                pr.id AS game_id,
                (ps->>'accountUserId')::bigint AS user_id,
                CASE
                  WHEN (ps->>'points') ~ '^-?[0-9]+$' THEN (ps->>'points')::int
                  ELSE 0
                END AS points
              FROM parsed_results pr
              JOIN LATERAL jsonb_array_elements(COALESCE(pr.payload->'playerStats', '[]'::jsonb)) ps ON TRUE
              WHERE pr.game_mode = 'ffa'
                AND (ps->>'accountUserId') ~ '^[0-9]+$'
            ),
            ffa_max_points AS (
              SELECT game_id, MAX(points) AS max_points
              FROM ffa_points
              GROUP BY game_id
            ),
            ffa_wins AS (
              SELECT fp.game_id, fp.user_id
              FROM ffa_points fp
              JOIN ffa_max_points fm ON fm.game_id = fp.game_id
              WHERE fm.max_points IS NOT NULL
                AND fp.points = fm.max_points
            ),
            all_wins AS (
              SELECT game_id, user_id FROM team_mode_wins
              UNION ALL
              SELECT game_id, user_id FROM ffa_wins
            ),
            wins_per_friend AS (
              SELECT
                user_id AS id,
                COUNT(*)::int AS wins
              FROM all_wins
              WHERE user_id IN (SELECT friend_id FROM user_friends)
              GROUP BY user_id
            )
            SELECT 
              u.id,
              u.display_name,
              u.avatar_url,
              u.equipped_cat_skin,
              u.equipped_dog_skin,
              u.preferred_mascot,
              {_effective_profile_frame_sql("u")} AS profile_frame,
              GREATEST(COALESCE(u.wins_total, 0), COALESCE(wpf.wins, 0)) as wins
            FROM auth_users u
            JOIN user_friends uf ON uf.friend_id = u.id
            LEFT JOIN wins_per_friend wpf ON wpf.id = u.id
            ORDER BY GREATEST(COALESCE(u.wins_total, 0), COALESCE(wpf.wins, 0)) DESC, u.display_name ASC
            LIMIT $2
            """,
            user_id,
            limit,
        )


async def send_room_invitation(inviter_id: int, invitee_id: int, room_id: str, status: str = "sent_to_invitee"):
    """Send a room invitation to a friend with specified status"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Check if invitation already exists
        existing = await conn.fetchrow(
            """
            SELECT id, room_id, inviter_id, invitee_id, status, created_at
            FROM room_invitations
            WHERE room_id = $1 AND inviter_id = $2 AND invitee_id = $3
            """,
            room_id,
            inviter_id,
            invitee_id,
        )

        if existing:
            existing_status = str(existing["status"] or "")
            # Keep active invitations as-is unless we can upgrade host-approved flow.
            if existing_status in {"sent_to_invitee", "pending", "pending_host_approval"}:
                if status == "sent_to_invitee" and existing_status == "pending_host_approval":
                    return await conn.fetchrow(
                        """
                        UPDATE room_invitations
                        SET status = $1, created_at = NOW(), updated_at = NOW()
                        WHERE id = $2
                        RETURNING id, room_id, inviter_id, invitee_id, status, created_at
                        """,
                        status,
                        existing["id"],
                    )
                return existing

            # Reactivate finished invitations (declined/accepted/rejected_by_host/etc).
            return await conn.fetchrow(
                """
                UPDATE room_invitations
                SET status = $1, created_at = NOW(), updated_at = NOW()
                WHERE id = $2
                RETURNING id, room_id, inviter_id, invitee_id, status, created_at
                """,
                status,
                existing["id"],
            )

        return await conn.fetchrow(
            """
            INSERT INTO room_invitations (room_id, inviter_id, invitee_id, status)
            VALUES ($1, $2, $3, $4)
            RETURNING id, room_id, inviter_id, invitee_id, status, created_at
            """,
            room_id,
            inviter_id,
            invitee_id,
            status,
        )


async def get_pending_room_invitations(user_id: int):
    """Get all pending room invitations for a user"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT 
              ri.id,
              ri.room_id,
              ri.inviter_id,
              u.display_name as inviter_name,
              u.avatar_url,
              ri.created_at
            FROM room_invitations ri
            JOIN auth_users u ON u.id = ri.inviter_id
            WHERE ri.invitee_id = $1 AND ri.status IN ('sent_to_invitee', 'pending')
            ORDER BY ri.created_at DESC
            """,
            user_id,
        )


async def has_room_invitation_access(invitee_id: int, room_id: str) -> bool:
    """Return True when user has invitation-based access to room."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        value = await conn.fetchval(
            """
            SELECT 1
            FROM room_invitations
            WHERE room_id = $1
              AND invitee_id = $2
              AND status = 'accepted'
            LIMIT 1
            """,
            str(room_id or "").upper()[:8],
            int(invitee_id),
        )
    return bool(value)


async def respond_to_room_invitation(invitee_id: int, room_id: str, accept: bool):
    """Accept or decline a room invitation"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        status = "accepted" if accept else "declined"
        return await conn.fetchrow(
            """
            UPDATE room_invitations
            SET status = $1, updated_at = NOW()
            WHERE room_id = $2 AND invitee_id = $3 AND status IN ('sent_to_invitee', 'pending')
            RETURNING id, room_id, inviter_id, invitee_id, status, updated_at
            """,
            status,
            room_id,
            invitee_id,
        )


async def get_room_invitation_by_id(invitation_id: int):
    """Get room invitation by id"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT id, room_id, inviter_id, invitee_id, status, created_at, updated_at
            FROM room_invitations
            WHERE id = $1
            """,
            int(invitation_id),
        )


async def host_approve_room_invitation(invitation_id: int, approve: bool):
    """Host approves or rejects a pending room invitation"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Update only pending host approvals
        invitation = await conn.fetchrow(
            """
            SELECT id, room_id, inviter_id, invitee_id, status
            FROM room_invitations
            WHERE id = $1 AND status = 'pending_host_approval'
            """,
            int(invitation_id),
        )

        if not invitation:
            return None

        # Update status based on approval
        status = "sent_to_invitee" if approve else "rejected_by_host"
        return await conn.fetchrow(
            """
            UPDATE room_invitations
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING id, room_id, inviter_id, invitee_id, status, updated_at
            """,
            status,
            int(invitation_id),
        )


async def get_pending_host_approvals(room_id: str):
    """Get all room invitations pending host approval"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT 
              ri.id,
              ri.room_id,
              ri.inviter_id,
              ri.invitee_id,
              u_inviter.display_name as inviter_name,
              u_inviter.avatar_url as inviter_avatar,
              u_invitee.display_name as invitee_name,
              u_invitee.avatar_url as invitee_avatar,
              ri.created_at
            FROM room_invitations ri
            JOIN auth_users u_inviter ON u_inviter.id = ri.inviter_id
            JOIN auth_users u_invitee ON u_invitee.id = ri.invitee_id
            WHERE ri.room_id = $1 AND ri.status = 'pending_host_approval'
            ORDER BY ri.created_at DESC
            """,
            room_id,
        )
