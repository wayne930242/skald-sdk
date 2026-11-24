// modules/character/ui/renderer/primitives/field-icon.tsx
//
// schema 指定圖示的唯一解析點。
//
// 收斂前，schema 有五處宣告 icon，實際行為各不相同：
// - 舊 List column icon 只認 Star / Check
// - ToolbarButton.icon 是 if/else 只認 Settings / Edit / Eye
// - FieldAction.icon、PanelSection.icon、PanelButton.icon 完全沒有消費端
// 內建系統的資料裡用到九種名稱，其中 Dices、Sparkles、Zap、Award、Clock、
// User、Calculator 全部被靜默丟掉，按鈕上什麼都不會出現。
//
// 為什麼是白名單而不是動態查表：lucide-react 匯出 5725 個符號，動態索引會讓
// 整包進 bundle。這裡逐一具名匯入，未用到的會被 tree-shake 掉。
//
// 未知名稱不靜默略過：投稿者寫錯字時必須看得見，否則只會反覆試而不知道原因。
"use client";

import * as React from "react";
import {
  Activity, AlertTriangle, Anchor, Award, Axe,
  Backpack, Bandage, Banknote, Beer, Bird, Bone, Book, BookOpen, Bookmark, Box, Brain, Briefcase, Bug,
  Calculator, Castle, Cat, Check, Church, CircleAlert, CircleHelp, Clock, Coffee, Cog, Coins, Compass, Crosshair, Crown,
  Dice1, Dices, Dog, Droplet, Droplets,
  Edit, Egg, Eye,
  Feather, Fish, Flag, Flame, Footprints,
  Gauge, Gem, Ghost, Glasses,
  Hammer, Hand, Heart, HeartPulse, HelpCircle, Home, Hourglass,
  Info,
  Key,
  Landmark, Leaf, Lightbulb, Lock,
  Map, Medal, MessageCircle, Minus, Moon, Mountain,
  Package, Pencil, Pill, Plus,
  Rabbit, Radio,
  Scroll, ScrollText, Settings, Shield, ShieldCheck, Skull, Snowflake, Sparkles, Sprout, Squirrel, Star, Sun, Sword, Swords, Syringe,
  Target, Tent, Timer, TreePine, Trophy, Turtle,
  User, Users, Utensils,
  Wallet, Wand, Wand2, Waves, Wind, Wrench,
  X, Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@skald/sheet-sdk/lib/utils";
import { GameIcon } from "./game-icon";
import { GAME_ICON_PREFIX } from "@skald/sheet-sdk/lib/game-icons/prefix";

/**
 * schema 可指定的圖示。
 *
 * 加名稱的原則：角色卡上真的用得到。要加請直接補進這張表，
 * 名稱與 lucide-react 的匯出名一致。
 */
const FIELD_ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, Anchor, Award, Axe,
  Backpack, Bandage, Banknote, Beer, Bird, Bone, Book, BookOpen, Bookmark, Box, Brain, Briefcase, Bug,
  Calculator, Castle, Cat, Check, Church, CircleAlert, CircleHelp, Clock, Coffee, Cog, Coins, Compass, Crosshair, Crown,
  Dice1, Dices, Dog, Droplet, Droplets,
  Edit, Egg, Eye,
  Feather, Fish, Flag, Flame, Footprints,
  Gauge, Gem, Ghost, Glasses,
  Hammer, Hand, Heart, HeartPulse, HelpCircle, Home, Hourglass,
  Info,
  Key,
  Landmark, Leaf, Lightbulb, Lock,
  Map, Medal, MessageCircle, Minus, Moon, Mountain,
  Package, Pencil, Pill, Plus,
  Rabbit, Radio,
  Scroll, ScrollText, Settings, Shield, ShieldCheck, Skull, Snowflake, Sparkles, Sprout, Squirrel, Star, Sun, Sword, Swords, Syringe,
  Target, Tent, Timer, TreePine, Trophy, Turtle,
  User, Users, Utensils,
  Wallet, Wand, Wand2, Waves, Wind, Wrench,
  X, Zap,
};

/** 取得圖示元件；名稱不在白名單時回傳 undefined */
export function resolveFieldIcon(name: string | undefined): LucideIcon | undefined {
  if (!name) return undefined;
  return FIELD_ICONS[name];
}

export function hasFieldIcon(name: string): boolean {
  return name in FIELD_ICONS;
}

/** 供測試與工具列舉可用名稱 */
export function getFieldIconNames(): string[] {
  return Object.keys(FIELD_ICONS).sort();
}

/**
 * 拆出 game-icons 的名稱；不是該前綴時回傳 undefined。
 *
 * 需要前綴是因為兩套來源的命名慣例會撞：lucide 是 PascalCase（Sword），
 * game-icons 是 kebab-case（sword）。沒有前綴的話，未來只要出現同名就無從判斷。
 */
export function parseGameIconName(name: string): string | undefined {
  return name.startsWith(GAME_ICON_PREFIX)
    ? name.slice(GAME_ICON_PREFIX.length)
    : undefined;
}

interface FieldIconProps {
  /** schema 指定的圖示名稱 */
  name?: string;
  /** 未指定 name 時使用的圖示 */
  fallback?: LucideIcon;
  className?: string;
}

/**
 * 依 schema 的名稱渲染圖示。
 *
 * - 沒給 name：畫 fallback（沒有 fallback 就什麼都不畫）
 * - game: 開頭：交給 GameIcon 按需取用（4133 個，不進 bundle）
 * - name 認得：畫該圖示
 * - name 不認得：畫問號並在 title 標出名稱。這是 schema 的錯字，
 *   靜默改畫 fallback 會讓投稿者以為自己寫對了。
 */
export function FieldIcon({ name, fallback: Fallback, className }: FieldIconProps) {
  if (!name) {
    return Fallback ? <Fallback className={className} /> : null;
  }

  const gameIconName = parseGameIconName(name);
  if (gameIconName) {
    return <GameIcon name={gameIconName} className={className} />;
  }

  const Icon = resolveFieldIcon(name);
  if (!Icon) {
    return (
      <CircleHelp
        className={cn("text-destructive", className)}
        aria-label={`unknown icon: ${name}`}
      >
        <title>{`unknown icon: ${name}`}</title>
      </CircleHelp>
    );
  }

  // eslint-disable-next-line react-hooks/static-components -- Icon 取自模組層級的常數表，不是在 render 時建立的元件
  return <Icon className={className} />;
}
