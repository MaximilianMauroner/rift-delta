import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Select } from "../ui/select.tsx";
import { Panel } from "../ui/panel.tsx";
import { COMBO_PRESETS, actionAvailable } from "../../browser/dps/presets.ts";
import { skillBounds } from "../../domains/dps/skills.ts";
import type { AbilityRanks, ActionKind } from "../../domains/dps/types.ts";


const RANK_KEYS = ["q", "w", "e", "r"] as const;
const ACTION_KEYS: ActionKind[] = ["AA", "Q", "W", "R", "E"];


export function AttackerCard({
  level,
  ranks,
  rankNotice,
  yunTalStacks,
  onLevel,
  onAdjustRank,
  onYunTalStacks,
}: {
  level: number;
  ranks: AbilityRanks;
  rankNotice: string;
  yunTalStacks: number;
  onLevel: (level: number) => void;
  onAdjustRank: (key: "q" | "w" | "e" | "r", delta: number) => void;
  onYunTalStacks: (stacks: number) => void;
}) {
  const bounds = skillBounds(level);
  return (
    <Panel className="dps-panel">
      <div className="rail-head">
        <h2>Attacker</h2>
        <strong>Yunara</strong>
        <span className="pill">Lv {level}</span>
      </div>
      <label className="fl" htmlFor="level">
        Level
      </label>
      <Select id="level" value={level} onChange={(event) => onLevel(Number(event.target.value))}>
        {Array.from({ length: 18 }, (_, index) => (
          <option key={index + 1}>{index + 1}</option>
        ))}
      </Select>
      <span className="fl">Ability ranks</span>
      <div className="ranks" role="group" aria-label="Ability ranks">
        {RANK_KEYS.map((key) => (
          <div className="rank" key={key}>
            <span>{key.toUpperCase()}</span>
            <div className="stepper">
              <Button
                variant="outline"
                aria-label={`Decrease ${key.toUpperCase()}`}
                disabled={ranks[key] <= bounds[key].min}
                onClick={() => onAdjustRank(key, -1)}
              >
                −
              </Button>
              <strong>
                {ranks[key]}
              </strong>
              <Button
                variant="outline"
                aria-label={`Increase ${key.toUpperCase()}`}
                disabled={ranks[key] >= bounds[key].max}
                onClick={() => onAdjustRank(key, 1)}
              >
                +
              </Button>
            </div>
            <small className="note">{bounds[key].min}–{bounds[key].max}</small>
          </div>
        ))}
      </div>
      {rankNotice && (
        <p className="warn" role="alert">
          {rankNotice}
        </p>
      )}
      <label className="fl" htmlFor="yun-tal-stacks">
        Yun Tal starting stacks
      </label>
      <Input
        id="yun-tal-stacks"
        type="number"
        min={0}
        max={125}
        step={1}
        value={yunTalStacks}
        onChange={(event) =>
          onYunTalStacks(Math.max(0, Math.min(125, Math.round(Number(event.target.value) || 0))))
        }
      />
      <p className="note">
        Ranged stacks out of 125. Stored frames do not expose crit chance, so this value is an
        explicit assumption. E is mobility-only.
      </p>
    </Panel>
  );
}

export function OpenerCard({
  actions,
  level,
  continueAutos,
  duration,
  onPreset,
  onAddAction,
  onRemoveAction,
  onMoveAction,
  onContinueAutos,
  onDuration,
}: {
  actions: ActionKind[];
  level: number;
  continueAutos: boolean;
  duration: number;
  onPreset: (preset: (typeof COMBO_PRESETS)[number]) => void;
  onAddAction: (action: ActionKind) => void;
  onRemoveAction: (index: number) => void;
  onMoveAction: (index: number, direction: -1 | 1) => void;
  onContinueAutos: (value: boolean) => void;
  onDuration: (seconds: number) => void;
}) {
  const illegal = !actions.every((action) => actionAvailable(action, level));
  return (
    <details className="fold opener-fold">
      <summary>Opener and fight length</summary>
      <div className="fold-body">
        <span className="fl">Preset</span>
        <div className="toggle" aria-label="Combo presets">
          {COMBO_PRESETS.map((preset) => (
            <Button variant="outline" key={preset.id} onClick={() => onPreset(preset)}>
              {preset.label}
            </Button>
          ))}
        </div>
        <span className="fl">Sequence</span>
        <div className="opener">
          {actions.map((action, index) => (
            <span className="op-wrap" key={`${action}-${index}`}>
              <Button variant="outline" className="op" onClick={() => onRemoveAction(index)} aria-label={`Remove ${action} action ${index + 1}`}>
                {action} <small aria-hidden>×</small>
              </Button>
              <Button
                variant="outline"
                className="op-move"
                aria-label={`Move ${action} ${index === 0 ? "later" : "earlier"}`}
                onClick={() => onMoveAction(index, index === 0 ? 1 : -1)}
              >
                {index === 0 ? "↓" : "↑"}
              </Button>
            </span>
          ))}
        </div>
        <div className="addrow">
          {ACTION_KEYS.map((action) => (
            <Button
              variant="outline"
              key={action}
              onClick={() => onAddAction(action)}
              disabled={!actionAvailable(action, level)}
            >
              + {action}
            </Button>
          ))}
        </div>
        {illegal && (
          <p className="warn">
            This opener contains an ability unavailable at level {level}; choose a preset or remove
            it.
          </p>
        )}
        <span className="fl">After the opener</span>
        <div className="toggle" role="group" aria-label="Continue autos">
          <Button
            variant="outline"
            className={continueAutos ? "on" : ""}
            onClick={() => onContinueAutos(true)}
            aria-pressed={continueAutos}
          >
            Keep autoing
          </Button>
          <Button
            variant="outline"
            className={!continueAutos ? "on" : ""}
            onClick={() => onContinueAutos(false)}
            aria-pressed={!continueAutos}
          >
            Stop
          </Button>
        </div>
        <label className="fl" htmlFor="duration">
          Custom fight length (seconds)
        </label>
        <Input
          id="duration"
          type="number"
          min={1}
          max={60}
          value={duration}
          onChange={(event) => onDuration(Number(event.target.value))}
        />
      </div>
    </details>
  );
}

export function TargetCard({
  targetMode,
  region,
  rank,
  role,
  phase,
  targetChampionDraft,
  appliedChampion,
  manual,
  metric,
  snapshotCount,
  onTargetMode,
  onRegion,
  onRank,
  onRole,
  onPhase,
  onChampionDraft,
  onCommitChampion,
  onManual,
  onMetric,
}: {
  targetMode: "realistic" | "manual";
  region: string;
  rank: string;
  role: string;
  phase: string;
  targetChampionDraft: string;
  appliedChampion: string;
  manual: {
    health: number;
    armor: number;
    magicResist: number;
    bonusHealth: number;
    level: number;
  };
  metric: "damage" | "ttk";
  snapshotCount: number | null;
  onTargetMode: (mode: "realistic" | "manual") => void;
  onRegion: (value: string) => void;
  onRank: (value: string) => void;
  onRole: (value: string) => void;
  onPhase: (value: string) => void;
  onChampionDraft: (value: string) => void;
  onCommitChampion: () => void;
  onManual: (next: typeof manual) => void;
  onMetric: (metric: "damage" | "ttk") => void;
}) {
  return (
    <Panel className="dps-panel">
      <div className="rail-head">
        <h2>Target</h2>
        {snapshotCount !== null && <span className="pill">{snapshotCount}</span>}
      </div>
      <div className="toggle" role="group" aria-label="Target mode">
        <Button
          variant="outline"
          className={targetMode === "realistic" ? "on" : ""}
          onClick={() => onTargetMode("realistic")}
          aria-pressed={targetMode === "realistic"}
        >
          Realistic
        </Button>
        <Button
          variant="outline"
          className={targetMode === "manual" ? "on" : ""}
          onClick={() => onTargetMode("manual")}
          aria-pressed={targetMode === "manual"}
        >
          Manual
        </Button>
      </div>
      {targetMode === "realistic" ? (
        <>
          <div className="two">
            <div>
              <label className="fl" htmlFor="region">
                Region
              </label>
              <Select id="region" value={region} onChange={(event) => onRegion(event.target.value)}>
                <option value="EUW1">EUW1</option>
                <option value="NA1">NA1</option>
                <option value="KR">KR</option>
              </Select>
            </div>
            <div>
              <label className="fl" htmlFor="rank">
                Rank
              </label>
              <Select id="rank" value={rank} onChange={(event) => onRank(event.target.value)}>
                <option value="ALL">All ranks</option>
                <option value="CHALLENGER">Challenger</option>
                <option value="GRANDMASTER">Grandmaster</option>
                <option value="MASTER">Master</option>
              </Select>
            </div>
          </div>
          <label className="fl" htmlFor="role">
            Role
          </label>
          <Select id="role" value={role} onChange={(event) => onRole(event.target.value)}>
            <option value="ALL">All roles</option>
            <option value="TOP">Top</option>
            <option value="JUNGLE">Jungle</option>
            <option value="MIDDLE">Middle</option>
            <option value="BOTTOM">Bottom</option>
            <option value="UTILITY">Utility</option>
          </Select>
          <label className="fl" htmlFor="phase">
            Timing
          </label>
          <Select id="phase" value={phase} onChange={(event) => onPhase(event.target.value)}>
            <option value="yunara-level">Same-frame Yunara level</option>
            <option value="yunara-third-item">Yunara third item</option>
            <option value="bot-carry-third-item">Bot carry fallback</option>
            <option value="minute-window">Around minute 25</option>
          </Select>
          <label className="fl" htmlFor="champ">
            Champion
          </label>
          <div className="apply-row">
            <Input
              id="champ"
              type="text"
              placeholder="Any champion"
              value={targetChampionDraft}
              onChange={(event) => onChampionDraft(event.target.value.slice(0, 48))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitChampion();
                }
              }}
            />
            <Button variant="outline" onClick={onCommitChampion}>Apply</Button>
          </div>
          <p className="note">
            Filter in use: {appliedChampion || "any champion"}. Typing does not fetch until Apply or
            Enter.
          </p>
        </>
      ) : (
        <div className="two" style={{ marginTop: 4 }}>
          {(
            [
              ["health", "Health"],
              ["armor", "Armor"],
              ["magicResist", "Magic resist"],
              ["bonusHealth", "Bonus HP"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="fl" htmlFor={`m-${key}`}>
                {label}
              </label>
              <Input
                id={`m-${key}`}
                type="number"
                value={manual[key]}
                onChange={(event) => onManual({ ...manual, [key]: Number(event.target.value) })}
              />
            </div>
          ))}
        </div>
      )}
      <span className="fl">Metric</span>
      <div className="toggle" role="group" aria-label="Comparison metric">
        <Button
          variant="outline"
          className={metric === "damage" ? "on" : ""}
          onClick={() => onMetric("damage")}
          aria-pressed={metric === "damage"}
        >
          Damage
        </Button>
        <Button
          variant="outline"
          className={metric === "ttk" ? "on" : ""}
          onClick={() => onMetric("ttk")}
          aria-pressed={metric === "ttk"}
        >
          TTK
        </Button>
      </div>
      <p className="note">
        {metric === "ttk"
          ? "Lower first-crossing time wins; uncensored kills only."
          : "Mortal targets stop at death; two kills are an applied-damage tie."}
      </p>
    </Panel>
  );
}
