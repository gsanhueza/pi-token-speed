import type { Theme } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  Focusable,
  KeybindingsManager,
  TUI,
} from "@earendil-works/pi-tui";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import type {
  CountStrategy,
  DisplayMode,
  EndTpsBehavior,
  ProviderOverride,
  ProviderOverrides,
  Thresholds,
  TierName,
} from "../config/config-types";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  END_TPS_BEHAVIOR_LABELS,
  ICONS,
  SLIDING_WINDOW_LABELS,
  TOGGLE_LABELS,
  UPDATE_INTERVAL_LABELS,
} from "../config/options";
import { settings } from "../config/settings";
import { Validator } from "../config/validation";
import { HexColorInput } from "./color-input";
import { coloredBlock } from "./color-picker";
import { ConfirmDialog, InputDialog } from "./dialog";
import { ResettableSettingsList } from "./resettable-settings-list";

/**
 * `/tps overrides` editor — manages the `providerOverrides` map.
 *
 * Modeled on pi-llama-cpp's `/models overrides`: a top-level list of
 * providers (add with `a`, delete with `d`, Enter drills into the block's
 * field editor). Within a block, every overridable field shows `(base)`
 * when unset; setting a value stores it in the block, resetting to
 * `(base)` removes the key so the base config applies again.
 *
 * The whole map is persisted via `settings.setProviderOverrides()` after
 * every change; the persisted snapshot is adopted so subsequent edits
 * never build on stale data.
 *
 * Every level also supports `r` ("return to default"): on a provider
 * row it resets the whole block to base (after confirmation), on a field
 * row it removes that override key, and on the Thresholds/Colors group
 * rows it removes the whole group.
 */

/** Label shown for fields not set in the override block. */
const BASE = "(base)";

/** Label for the empty icon value (matches the base `/tps` menu). */
const EMPTY = "(empty)";

/** Field ids inside a provider override block. */
const Fields = {
  DISPLAY: "display",
  ICON: "icon",
  UPDATE_INTERVAL: "updateInterval",
  USE_PROVIDER_TOKENS: "useProviderTokens",
  COUNT_STRATEGY: "countStrategy",
  SLIDING_WINDOW: "slidingWindow",
  END_TPS_BEHAVIOR: "endTpsBehavior",
} as const;

const TIERS: { key: TierName; label: string }[] = [
  { key: "slow", label: "Slow" },
  { key: "medium", label: "Medium" },
  { key: "fast", label: "Fast" },
  { key: "blazing", label: "Blazing" },
];

/** Shared editor options, mirroring pi-llama-cpp's OverrideSettingsListOptions. */
interface OverridesEditorOptions {
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  /**
   * Snapshot of the `providerOverrides` map to edit. Replaced in place
   * (`options.overrides = next`) after every successful persist so both
   * editor levels always read adopted values.
   */
  overrides: ProviderOverrides;
  /** Persists a whole new overrides map; a rejection keeps the current one */
  persist: (next: ProviderOverrides) => Promise<void>;
  /** Closes the editor (Esc in the provider list) */
  done: () => void;
  /** Notifies about persistence errors */
  onError: (message: string) => void;
  /** Notifies about validation warnings */
  onWarning: (message: string) => void;
}

/**
 * Inverts a label map (`{ tps: "TPS speed" }` → `{ "TPS speed": "tps" }`).
 */
const invertLabels = (obj: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));

/**
 * Persists `next`; on success adopts it as the editor's snapshot.
 *
 * Adopting the persisted map is essential: the editor holds a snapshot
 * taken when it opened (not a live reference), so without this the next
 * edit would build on stale data (same rationale as pi-llama-cpp's
 * `persistSnapshot`).
 *
 * @returns True when the map was persisted and adopted.
 */
const persistNext = async (
  options: OverridesEditorOptions,
  next: ProviderOverrides,
): Promise<boolean> => {
  try {
    await options.persist(next);
  } catch (err) {
    options.onError(String(err));
    return false;
  }
  options.overrides = next;
  return true;
};

/**
 * Formats a block as the summary shown in the provider rows.
 * Only explicitly-set keys appear; `—` when the block is empty.
 */
const formatOverrideSummary = (block: ProviderOverride): string => {
  const parts: string[] = [];
  if (block.display !== undefined)
    parts.push(`display: ${DISPLAY_LABELS[block.display]}`);
  if (block.icon !== undefined)
    parts.push(`icon: ${block.icon === "" ? EMPTY : block.icon}`);
  if (block.updateInterval !== undefined)
    parts.push(`updateInterval: ${block.updateInterval}ms`);
  if (block.useProviderTokens !== undefined)
    parts.push(`provider tokens: ${block.useProviderTokens ? "on" : "off"}`);
  if (block.countStrategy !== undefined)
    parts.push(`count: ${block.countStrategy}`);
  if (block.slidingWindow !== undefined)
    parts.push(`window: ${block.slidingWindow}ms`);
  if (block.endTpsBehavior !== undefined)
    parts.push(`end TPS: ${block.endTpsBehavior}`);
  if (block.thresholds !== undefined) {
    const set = TIERS.filter((t) => block.thresholds![t.key] !== undefined);
    if (set.length > 0) {
      parts.push(
        `thresholds: ${set.map((t) => `${t.key}=${block.thresholds![t.key]}`).join(" ")}`,
      );
    }
  }
  if (block.colors !== undefined) {
    const tiers = TIERS.filter((t) => block.colors![t.key] !== undefined);
    if (tiers.length > 0) {
      parts.push(`colors: ${tiers.map((t) => block.colors![t.key]).join(" ")}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "—";
};

/**
 * Computes the currentValue shown for a block field row.
 * Used both when building the items and when refreshing after a commit.
 */
const fieldValue = (id: string, block: ProviderOverride): string => {
  switch (id) {
    case Fields.DISPLAY:
      return block.display !== undefined ? DISPLAY_LABELS[block.display] : BASE;
    case Fields.ICON:
      return block.icon === undefined
        ? BASE
        : block.icon === ""
          ? EMPTY
          : block.icon;
    case Fields.UPDATE_INTERVAL:
      return block.updateInterval?.toString() ?? BASE;
    case Fields.USE_PROVIDER_TOKENS:
      return block.useProviderTokens === undefined
        ? BASE
        : block.useProviderTokens
          ? TOGGLE_LABELS.on
          : TOGGLE_LABELS.off;
    case Fields.COUNT_STRATEGY:
      return block.countStrategy !== undefined
        ? COUNT_STRATEGY_LABELS[block.countStrategy]
        : BASE;
    case Fields.SLIDING_WINDOW:
      return block.slidingWindow?.toString() ?? BASE;
    case Fields.END_TPS_BEHAVIOR:
      return block.endTpsBehavior !== undefined
        ? END_TPS_BEHAVIOR_LABELS[block.endTpsBehavior]
        : BASE;
    default:
      // Group rows (same appearance as the base `/tps` menu)
      if (id === "thresholds") {
        return TIERS.map(
          (t) => block.thresholds?.[t.key]?.toString() ?? BASE,
        ).join(" | ");
      }
      if (id === "colors") {
        const base = settings.getConfig();
        return TIERS.map((t) =>
          coloredBlock(block.colors?.[t.key] ?? base.colors[t.key]),
        ).join(" ");
      }
      if (id.startsWith("thresholds.")) {
        const tier = id.slice("thresholds.".length) as TierName;
        return block.thresholds?.[tier]?.toString() ?? BASE;
      }
      if (id.startsWith("colors.")) {
        const tier = id.slice("colors.".length) as TierName;
        return block.colors?.[tier] ?? BASE;
      }
      return "";
  }
};

/**
 * Computes the next block after a field change. Invalid values return
 * `null` (the warning has already been notified by the caller's options).
 * Empty input on input-dialog fields means "reset to base" (key removed).
 */
const computeNextBlock = (
  options: OverridesEditorOptions,
  block: ProviderOverride,
  id: string,
  value: string,
): ProviderOverride | null => {
  const next: ProviderOverride = { ...block };
  const base = settings.getConfig();

  switch (id) {
    case Fields.DISPLAY:
      if (value === BASE) delete next.display;
      else next.display = invertLabels(DISPLAY_LABELS)[value] as DisplayMode;
      return next;
    case Fields.ICON:
      if (value === BASE) delete next.icon;
      else next.icon = value === EMPTY ? "" : value;
      return next;
    case Fields.UPDATE_INTERVAL: {
      if (value === BASE) {
        delete next.updateInterval;
        return next;
      }
      const n = Number(invertLabels(UPDATE_INTERVAL_LABELS)[value]);
      if (!Number.isFinite(n) || n < 0) return null;
      next.updateInterval = n;
      return next;
    }
    case Fields.USE_PROVIDER_TOKENS:
      if (value === BASE) delete next.useProviderTokens;
      else next.useProviderTokens = value === TOGGLE_LABELS.on;
      return next;
    case Fields.COUNT_STRATEGY:
      if (value === BASE) delete next.countStrategy;
      else
        next.countStrategy = invertLabels(COUNT_STRATEGY_LABELS)[
          value
        ] as CountStrategy;
      return next;
    case Fields.SLIDING_WINDOW: {
      if (value === BASE) {
        delete next.slidingWindow;
        return next;
      }
      const n = Number(invertLabels(SLIDING_WINDOW_LABELS)[value]);
      if (!Number.isFinite(n)) return null;
      next.slidingWindow = n;
      return next;
    }
    case Fields.END_TPS_BEHAVIOR:
      if (value === BASE) delete next.endTpsBehavior;
      else
        next.endTpsBehavior = invertLabels(END_TPS_BEHAVIOR_LABELS)[
          value
        ] as EndTpsBehavior;
      return next;
  }

  if (id.startsWith("thresholds.")) {
    const tier = id.slice("thresholds.".length) as TierName;
    const thresholds: Partial<Thresholds> = { ...(block.thresholds ?? {}) };
    if (value === "") {
      delete thresholds[tier];
    } else {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return null;
      thresholds[tier] = n;
    }
    if (Object.keys(thresholds).length > 0) {
      // Validate the effective ordering (base fallback for omitted tiers)
      const merged = { ...base.thresholds, ...thresholds };
      const ordered =
        merged.slow < merged.medium &&
        merged.medium < merged.fast &&
        merged.fast < merged.blazing;
      if (!ordered) {
        options.onWarning(
          [
            "[pi-token-speed]",
            "- TPS thresholds must be in ascending order.",
            `  Effective: ${merged.slow} < ${merged.medium} < ${merged.fast} < ${merged.blazing}.`,
          ].join("\n"),
        );
        return null;
      }
      next.thresholds = thresholds;
    } else {
      delete next.thresholds;
    }
    return next;
  }

  if (id.startsWith("colors.")) {
    const tier = id.slice("colors.".length) as TierName;
    const colors = { ...(block.colors ?? {}) };
    if (value === "") {
      delete colors[tier];
    } else {
      colors[tier] = value.toLowerCase();
    }
    if (Object.keys(colors).length > 0) next.colors = colors;
    else delete next.colors;
    return next;
  }

  return null;
};

/**
 * Builds the SettingsList items for one provider's override block,
 * mirroring the base `/tps` menu's appearance: cycling rows for the
 * scalar fields, plus grouped "Thresholds" and "Colors" rows that open
 * nested SettingsLists with the per-tier rows.
 *
 * `getBlock` reads the adopted block fresh (needed by the lazily-created
 * nested rows); `nested` receives the per-tier item arrays so commits can
 * refresh them in place.
 */
const buildBlockItems = (
  getBlock: () => ProviderOverride,
  commit: (id: string, value: string) => void,
  nested: { thresholds: SettingItem[] | null; colors: SettingItem[] | null },
  theme: Theme,
  tui: TUI,
): SettingItem[] => {
  const base = settings.getConfig();

  const cyclingItem = (
    id: string,
    label: string,
    description: string,
    values: string[],
  ): SettingItem => ({
    id,
    label,
    description,
    currentValue: fieldValue(id, getBlock()),
    values,
  });

  const items: SettingItem[] = [
    cyclingItem(
      Fields.DISPLAY,
      "Display mode",
      `Base: ${DISPLAY_LABELS[base.display]}`,
      [BASE, ...Object.values(DISPLAY_LABELS)],
    ),
    cyclingItem(
      Fields.ICON,
      "Status icon",
      `Base: ${base.icon === "" ? EMPTY : base.icon}`,
      [BASE, ...ICONS, EMPTY],
    ),
    cyclingItem(
      Fields.UPDATE_INTERVAL,
      "Status update interval",
      `Base: ${base.updateInterval}ms`,
      [BASE, ...Object.values(UPDATE_INTERVAL_LABELS)],
    ),
    cyclingItem(
      Fields.USE_PROVIDER_TOKENS,
      "Use provider tokens",
      `Base: ${base.useProviderTokens ? "on" : "off"}`,
      [BASE, ...Object.values(TOGGLE_LABELS)],
    ),
    cyclingItem(
      Fields.COUNT_STRATEGY,
      "Count strategy",
      `Base: ${base.countStrategy}`,
      [BASE, ...Object.values(COUNT_STRATEGY_LABELS)],
    ),
    cyclingItem(
      Fields.SLIDING_WINDOW,
      "Sliding window",
      `Base: ${base.slidingWindow}ms`,
      [BASE, ...Object.values(SLIDING_WINDOW_LABELS)],
    ),
    cyclingItem(
      Fields.END_TPS_BEHAVIOR,
      "End-of-stream TPS",
      `Base: ${END_TPS_BEHAVIOR_LABELS[base.endTpsBehavior]}`,
      [BASE, ...Object.values(END_TPS_BEHAVIOR_LABELS)],
    ),
  ];

  // Grouped rows, matching the base menu's Thresholds/Colors entries
  items.push({
    id: "thresholds",
    label: "Thresholds",
    description:
      "Customize TPS threshold overrides (slow, medium, fast, blazing)",
    currentValue: fieldValue("thresholds", getBlock()),
    submenu: (_currentValue: string, submenuDone: (value?: string) => void) => {
      // Built lazily so the prefills reflect the adopted block
      const tierItems = TIERS.map((tier) => ({
        id: `thresholds.${tier.key}`,
        label: tier.label,
        description: `TPS threshold override for the ${tier.label.toLowerCase()} tier (Base: ${base.thresholds[tier.key]})`,
        currentValue: fieldValue(`thresholds.${tier.key}`, getBlock()),
        submenu: InputDialog.inputSubmenu(theme, tui, {
          title: `${tier.label} threshold override`,
          message: `TPS threshold for the ${tier.label.toLowerCase()} tier (empty = reset to base: ${base.thresholds[tier.key]})`,
          placeholder: "non-negative integer",
          initialValue: getBlock().thresholds?.[tier.key]?.toString() ?? "",
          validate: (raw) => {
            const trimmed = raw.trim();
            if (trimmed === "") return ""; // reset to base
            const n = Number(trimmed);
            return Number.isInteger(n) && n >= 0 ? n.toString() : null;
          },
        }),
      }));
      nested.thresholds = tierItems;
      // `r` on a tier row drops that tier's override key ("" is the
      // same reset the input dialog's empty submit sends)
      return new ResettableSettingsList(
        tierItems,
        Math.min(tierItems.length + 2, 15),
        getSettingsListTheme(),
        commit,
        () => submenuDone(undefined),
        (id) => commit(id, ""),
      );
    },
  });

  items.push({
    id: "colors",
    label: "Colors",
    description: "Customize tier color overrides (slow, medium, fast, blazing)",
    currentValue: fieldValue("colors", getBlock()),
    submenu: (_currentValue: string, submenuDone: (value?: string) => void) => {
      const tierItems = TIERS.map((tier) => {
        const hex = getBlock().colors?.[tier.key] ?? base.colors[tier.key];
        return {
          id: `colors.${tier.key}`,
          label: `${coloredBlock(hex)} ${tier.label}`,
          description: `Hex color override for the ${tier.label.toLowerCase()} tier (Base: ${base.colors[tier.key]})`,
          currentValue: fieldValue(`colors.${tier.key}`, getBlock()),
          submenu: InputDialog.inputSubmenu(theme, tui, {
            title: `${tier.label} color override`,
            message: `Hex color for the ${tier.label.toLowerCase()} tier (empty = reset to base: ${base.colors[tier.key]})`,
            placeholder: "#RRGGBB",
            initialValue: getBlock().colors?.[tier.key] ?? "",
            createInput: () => new HexColorInput(),
            validate: (raw) => {
              const trimmed = raw.trim();
              if (trimmed === "") return ""; // reset to base
              return Validator.isValidHex(trimmed)
                ? trimmed.toLowerCase()
                : null;
            },
          }),
        };
      });
      nested.colors = tierItems;
      // `r` on a tier row drops that tier's override key
      return new ResettableSettingsList(
        tierItems,
        Math.min(tierItems.length + 2, 15),
        getSettingsListTheme(),
        commit,
        () => submenuDone(undefined),
        (id) => commit(id, ""),
      );
    },
  });

  return items;
};

/**
 * Creates the field SettingsList for one provider's override block.
 * Commits persist the whole map, refresh the block rows in place and
 * notify the parent list so the provider row's summary stays current.
 */
const createBlockList = (
  options: OverridesEditorOptions,
  providerId: string,
  onSummaryChanged: () => void,
  done: () => void,
  onClose: () => void,
): SettingsList => {
  const { theme, tui } = options;
  // Per-tier submenu item refs, kept for in-place refresh after commits
  // (mirrors the base menu's thresholdSubmenuItems/colorSubmenuItems)
  const nested = {
    thresholds: null as SettingItem[] | null,
    colors: null as SettingItem[] | null,
  };
  const items = buildBlockItems(
    () => options.overrides[providerId] ?? {},
    commit,
    nested,
    theme,
    tui,
  );

  /*
   * refresh/commit are function declarations (hoisted) because the items
   * above capture `commit` in their lazily-invoked submenu factories.
   */

  /**
   * Refreshes every row's currentValue (and nested per-tier rows) from
   * the adopted block. Mutating the SettingItem objects in place is the
   * supported update path (same as the base menu's refresh helpers).
   */
  function refresh(block: ProviderOverride) {
    const base = settings.getConfig();
    for (const item of items) {
      item.currentValue = fieldValue(item.id, block);
    }
    if (nested.thresholds) {
      for (const item of nested.thresholds) {
        const tier = item.id.slice("thresholds.".length) as TierName;
        item.currentValue = block.thresholds?.[tier]?.toString() ?? BASE;
      }
    }
    if (nested.colors) {
      for (const item of nested.colors) {
        const tier = item.id.slice("colors.".length) as TierName;
        const hex = block.colors?.[tier] ?? base.colors[tier];
        const label = TIERS.find((t) => t.key === tier)!.label;
        item.label = `${coloredBlock(hex)} ${label}`;
        item.currentValue = block.colors?.[tier] ?? BASE;
      }
    }
  }

  function applyNextBlock(nextBlock: ProviderOverride) {
    const next: ProviderOverrides = { ...options.overrides };
    // An empty block is equivalent to no block (every field falls back
    // to base): drop the entry so the map never accumulates empty objects
    if (Object.keys(nextBlock).length === 0) delete next[providerId];
    else next[providerId] = nextBlock;
    void (async () => {
      const ok = await persistNext(options, next);
      if (!ok) return;
      refresh(nextBlock);
      onSummaryChanged();
      tui.requestRender();
    })();
  }

  function commit(id: string, value: string) {
    const current = options.overrides[providerId] ?? {};
    const nextBlock = computeNextBlock(options, current, id, value);
    if (nextBlock === null) return;
    applyNextBlock(nextBlock);
  }

  /**
   * `r` shortcut: resets the selected row to its base value. Scalar
   * fields and per-tier rows drop their override key; the Thresholds
   * and Colors group rows drop the whole group.
   */
  function resetField(id: string) {
    const current = options.overrides[providerId] ?? {};
    if (id === "thresholds" || id === "colors") {
      const nextBlock = { ...current };
      delete nextBlock[id];
      applyNextBlock(nextBlock);
      return;
    }
    // Same value the reset paths send: BASE for cycling fields, "" for
    // the input-dialog fields (per-tier rows)
    const value =
      id.startsWith("thresholds.") || id.startsWith("colors.") ? "" : BASE;
    const nextBlock = computeNextBlock(options, current, id, value);
    if (nextBlock === null) return;
    applyNextBlock(nextBlock);
  }

  return new ResettableSettingsList(
    items,
    Math.min(items.length + 2, 15),
    getSettingsListTheme(),
    commit,
    () => {
      onClose();
      done();
    },
    resetField,
  );
};

/**
 * Top-level overrides editor: a SettingsList of providers with add/delete
 * support, drilling down into each provider's override block editor.
 */
export class OverridesEditor implements Component, Focusable {
  private settingsList: SettingsList | null = null;
  private mode: "list" | "add" | "confirm" = "list";
  private addDialog: InputDialog | undefined;
  private confirmDialog: ConfirmDialog | undefined;
  private isFocused = false;
  private selectedIndex = 0;
  /** Tracks whether a row's field editor is open (see handleInput) */
  private submenuOpen = false;

  constructor(private readonly options: OverridesEditorOptions) {
    this.settingsList = this.buildList();
  }

  // -- Focusable -----------------------------------------------------------

  get focused(): boolean {
    return this.isFocused;
  }

  set focused(value: boolean) {
    this.isFocused = value;
    if (this.addDialog) this.addDialog.focused = value;
    if (this.confirmDialog) this.confirmDialog.focused = value;
  }

  // -- Component -----------------------------------------------------------

  invalidate(): void {
    this.settingsList?.invalidate();
    this.addDialog?.invalidate();
    this.confirmDialog?.invalidate();
  }

  handleInput(data: string): void {
    if (this.mode === "add") {
      this.addDialog?.handleInput(data);
      return;
    }

    if (this.mode === "confirm") {
      this.confirmDialog?.handleInput(data);
      return;
    }

    // A provider row's block editor is open: delegate everything (Esc,
    // a/d, arrows) to the containing SettingsList, which forwards input
    // to the submenu. Intercepting here would close the whole editor on
    // Esc and trigger add/delete while editing a block.
    if (this.submenuOpen && this.settingsList) {
      this.settingsList.handleInput(data);
      return;
    }

    const kb = this.options.keybindings;
    if (kb.matches(data, "tui.select.cancel")) {
      this.options.done();
      return;
    }
    // Track selection for add/delete (delegate to SettingsList for rendering)
    if (kb.matches(data, "tui.select.up")) {
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.getProviderIds().length - 1
          : this.selectedIndex - 1;
    }
    if (kb.matches(data, "tui.select.down")) {
      this.selectedIndex =
        this.selectedIndex === this.getProviderIds().length - 1
          ? 0
          : this.selectedIndex + 1;
    }
    if (data === "a") {
      this.beginAdd();
      return;
    }
    if (data === "d") {
      this.beginConfirm();
      return;
    }
    if (this.settingsList) {
      this.settingsList.handleInput(data);
    }
  }

  render(width: number): string[] {
    if (this.mode === "add") {
      return this.addDialog?.render(width) ?? [];
    }

    if (this.mode === "confirm") {
      return this.confirmDialog?.render(width) ?? [];
    }

    if (this.settingsList) {
      // The shortcuts live in the rows' description; only when the list is
      // empty (no rows → no description) show them as the hint line
      const lines = this.settingsList.render(width);
      if (this.getProviderIds().length === 0) {
        lines[lines.length - 1] = getSettingsListTheme().hint(
          "Press (a) to add a provider override · Esc to close",
        );
      }
      return lines;
    }
    return ["Loading..."];
  }

  // -- helpers ---------------------------------------------------------------

  private getProviderIds(): string[] {
    return Object.keys(this.options.overrides);
  }

  private buildList(): SettingsList {
    // A fresh list never has a submenu open
    this.submenuOpen = false;
    const ids = this.getProviderIds();
    const items: SettingItem[] = ids.map((id, i) => ({
      id: `provider-${i}`,
      label: id,
      description: "(a) add provider · (d) remove provider",
      currentValue: formatOverrideSummary(this.options.overrides[id] ?? {}),
      submenu: (_cv: string, done: (value?: string) => void) => {
        this.submenuOpen = true;
        return createBlockList(
          this.options,
          id,
          // Refresh this row's summary after a block commit
          () => {
            this.settingsList?.updateValue(
              `provider-${i}`,
              formatOverrideSummary(this.options.overrides[id] ?? {}),
            );
          },
          done,
          () => {
            this.submenuOpen = false;
          },
        );
      },
    }));

    return new ResettableSettingsList(
      items,
      Math.min(items.length + 2, 15),
      getSettingsListTheme(),
      () => {
        // Provider rows only open submenus; nothing changes at this level
      },
      () => {
        this.options.done();
      },
      // `r` on a provider row resets its whole block to base
      (itemId) => {
        const providerId =
          this.getProviderIds()[Number(itemId.slice("provider-".length))];
        if (providerId !== undefined) this.beginReset(providerId);
      },
    );
  }

  /**
   * Rebuilds the provider list and places the cursor on `targetIndex`
   * (clamped to the last entry). Needed after add/delete because the row
   * count changed; `selectItem` is the supported way to restore position.
   */
  private rebuildList(targetIndex: number): void {
    this.settingsList = this.buildList();
    const count = this.getProviderIds().length;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    const target = Math.min(targetIndex, count - 1);
    this.selectedIndex = target;
    this.settingsList.selectItem(`provider-${target}`);
  }

  private beginAdd(): void {
    const { theme, tui } = this.options;
    this.mode = "add";
    this.addDialog = new InputDialog({
      theme,
      tui,
      title: "Add provider override",
      message: 'Provider id to override (e.g. "anthropic")',
      placeholder: "anthropic",
      validate: (raw) => {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
      },
      onSubmit: (value) => {
        this.addDialog = undefined;
        void this.saveAdd(value);
      },
      onCancel: () => {
        this.addDialog = undefined;
        this.mode = "list";
        this.options.tui.requestRender();
      },
    });
    this.addDialog.focused = this.isFocused;
    this.options.tui.requestRender();
  }

  /**
   * Opens the confirmation dialog for deleting the selected provider's
   * override block (`d`).
   */
  private beginConfirm(): void {
    const id = this.getProviderIds()[this.selectedIndex];
    if (!id) return;

    this.openConfirmDialog(
      "Delete provider override",
      `Delete overrides for "${id}"?`,
      () => {
        void this.deleteSelected();
      },
    );
  }

  /**
   * Opens the confirmation dialog for resetting all of a provider's
   * overrides back to base (`r` on a provider row). Removing the block
   * is exactly the reset: an absent block means every field falls back
   * to base, so this reuses the delete path.
   */
  private beginReset(providerId: string): void {
    this.openConfirmDialog(
      "Reset provider overrides",
      `Reset all overrides for "${providerId}" to base?`,
      () => {
        void this.deleteSelected();
      },
    );
  }

  /** Opens the confirmation dialog shared by delete/reset. */
  private openConfirmDialog(
    title: string,
    message: string,
    onConfirm: () => void,
  ): void {
    const { theme, tui } = this.options;
    this.mode = "confirm";
    this.confirmDialog = new ConfirmDialog({
      theme,
      tui,
      title,
      message,
      onConfirm: () => {
        this.confirmDialog = undefined;
        onConfirm();
      },
      onCancel: () => {
        this.confirmDialog = undefined;
        this.mode = "list";
        this.options.tui.requestRender();
      },
    });
    this.confirmDialog.focused = this.isFocused;
    this.options.tui.requestRender();
  }

  private async saveAdd(id: string): Promise<void> {
    // Already exists: nothing to add, just close the dialog
    if (this.options.overrides[id] !== undefined) {
      this.mode = "list";
      this.options.tui.requestRender();
      return;
    }

    const next: ProviderOverrides = { ...this.options.overrides, [id]: {} };
    const ok = await persistNext(this.options, next);
    this.mode = "list";
    if (ok) {
      // The new entry is appended last — put the cursor on it
      this.rebuildList(this.getProviderIds().length - 1);
    }
    this.options.tui.requestRender();
  }

  private async deleteSelected(): Promise<void> {
    const idx = this.selectedIndex;
    const id = this.getProviderIds()[idx];
    if (!id) return;

    const next = { ...this.options.overrides };
    delete next[id];
    const ok = await persistNext(this.options, next);
    this.mode = "list";
    if (ok) {
      // The entry that followed the deleted one now sits at the same index
      // (rebuildList clamps when the last entry was deleted)
      this.rebuildList(idx);
    }
    this.options.tui.requestRender();
  }
}
