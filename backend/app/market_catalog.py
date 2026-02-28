from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ItemType = Literal["mascot_skin", "profile_frame", "victory_effect"]
MascotKind = Literal["cat", "dog"]
VictoryEffectLayer = Literal["front", "back"]


@dataclass(frozen=True)
class MarketItem:
    item_id: str
    title: str
    description: str
    price: int
    item_type: ItemType
    mascot_kind: MascotKind | None = None
    victory_effect_layer: VictoryEffectLayer | None = None
    victory_effect_path: str | None = None


MARKET_ITEMS: dict[str, MarketItem] = {
    "cat_header_1": MarketItem(
        item_id="cat_header_1",
        title="Академик",
        description="Поднял лапу ещё до вопроса. И, конечно, был прав.",
        price=45,
        item_type="mascot_skin",
        mascot_kind="cat",
    ),
    "cat_header_2": MarketItem(
        item_id="cat_header_2",
        title="Маленький Монарх",
        description="Король дивана. Король раунда. Король всего.",
        price=60,
        item_type="mascot_skin",
        mascot_kind="cat",
    ),
    "cat_neck_1": MarketItem(
        item_id="cat_neck_1",
        title="Деловой Гений",
        description="Не угадывает. Инвестирует в правильные ответы.",
        price=52,
        item_type="mascot_skin",
        mascot_kind="cat",
    ),
    "cat_body_1": MarketItem(
        item_id="cat_body_1",
        title="Лягушачий Страж",
        description="Ква-ква",
        price=95,
        item_type="mascot_skin",
        mascot_kind="cat",
    ),
    "dog_header_1": MarketItem(
        item_id="dog_header_1",
        title="Пельменный Магистр",
        description="Когда голоден — опасен. Когда сыт — непобедим.",
        price=60,
        item_type="mascot_skin",
        mascot_kind="dog",
    ),
    "dog_header_2": MarketItem(
        item_id="dog_header_2",
        title="Морской Разбойник",
        description="Для тех, кто идёт ва-банк и забирает максимум очков.",
        price=52,
        item_type="mascot_skin",
        mascot_kind="dog",
    ),
    "dog_neck_1": MarketItem(
        item_id="dog_neck_1",
        title="Красный Бандит",
        description="Врывается в раунд. Крадёт очки. Убегает.",
        price=52,
        item_type="mascot_skin",
        mascot_kind="dog",
    ),
    "dog_body_1": MarketItem(
        item_id="dog_body_1",
        title="Сонный Напарник",
        description="Пусть он спит. Он всё равно поможет тебе победить.",
        price=95,
        item_type="mascot_skin",
        mascot_kind="dog",
    ),
    "profile_frame_aurora": MarketItem(
        item_id="profile_frame_aurora",
        title="Полярный пульс",
        description="Lottie-рамка с мягким переливом и свечением.",
        price=155,
        item_type="profile_frame",
    ),
    "profile_frame_gold": MarketItem(
        item_id="profile_frame_gold",
        title="Необычный контур",
        description="Lottie-рамка с теплым золотым свечением.",
        price=165,
        item_type="profile_frame",
    ),
    "profile_frame_neon_circuit": MarketItem(
        item_id="profile_frame_neon_circuit",
        title="Неон-схема",
        description="Обычная неоновая рамка с переливом.",
        price=95,
        item_type="profile_frame",
    ),
    "profile_frame_holo_glass": MarketItem(
        item_id="profile_frame_holo_glass",
        title="Голо-стекло",
        description="Обычная голографическая рамка с мягким бликом.",
        price=105,
        item_type="profile_frame",
    ),
    "profile_frame_glitch_edge": MarketItem(
        item_id="profile_frame_glitch_edge",
        title="Глитч-кромка",
        description="Lottie-рамка с неон-фиолетовым глитч-эффектом.",
        price=175,
        item_type="profile_frame",
    ),
    "profile_frame_champion_laurel": MarketItem(
        item_id="profile_frame_champion_laurel",
        title="Лавры чемпиона",
        description="Lottie-рамка для победителя с ярким акцентом.",
        price=195,
        item_type="profile_frame",
    ),
    "victory_front_confetti2": MarketItem(
        item_id="victory_front_confetti2",
        title="Конфетти+",
        description="Усиленный эффект победы перед талисманом.",
        price=95,
        item_type="victory_effect",
        victory_effect_layer="front",
        victory_effect_path="/Confetti2.lottie",
    ),
    "victory_front_confetti_default": MarketItem(
        item_id="victory_front_confetti_default",
        title="Конфетти",
        description="Базовый эффект победы перед талисманом.",
        price=0,
        item_type="victory_effect",
        victory_effect_layer="front",
        victory_effect_path="/confetti.json",
    ),
    "victory_front_winner_bg": MarketItem(
        item_id="victory_front_winner_bg",
        title="Вспышка",
        description="Световой эффект позади талисмана.",
        price=0,
        item_type="victory_effect",
        victory_effect_layer="back",
        victory_effect_path="/winner background.json",
    ),
    "victory_back_success": MarketItem(
        item_id="victory_back_success",
        title="Триумф",
        description="Фоновый эффект победы за талисманом.",
        price=105,
        item_type="victory_effect",
        victory_effect_layer="back",
        victory_effect_path="/Success celebration.lottie",
    ),
    "victory_back_vui": MarketItem(
        item_id="victory_back_vui",
        title="Волна",
        description="Фоновый интерфейсный эффект за талисманом.",
        price=95,
        item_type="victory_effect",
        victory_effect_layer="back",
        victory_effect_path="/VUI Animation.lottie",
    ),
    "victory_back_stars": MarketItem(
        item_id="victory_back_stars",
        title="Звезды",
        description="Фоновые звезды за талисманом.",
        price=80,
        item_type="victory_effect",
        victory_effect_layer="back",
        victory_effect_path="/backround stars.lottie",
    ),
}


DEFAULT_OWNED_MARKET_ITEM_IDS: tuple[str, ...] = (
    "victory_front_confetti_default",
    "victory_front_winner_bg",
)

DEFAULT_EQUIPPED_VICTORY_FRONT_EFFECT_ITEM_ID = "victory_front_confetti_default"
DEFAULT_EQUIPPED_VICTORY_BACK_EFFECT_ITEM_ID = "victory_front_winner_bg"


def get_market_item(item_id: str) -> MarketItem | None:
    return MARKET_ITEMS.get(str(item_id or "").strip())
