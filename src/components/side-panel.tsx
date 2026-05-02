"use client";

import { useState } from "react";
import type { PlanState, UserProfileState } from "../lib/triage-types";
import { PlanPanel } from "./plan-panel";
import { FileList } from "./file-list";
import { DocPanel } from "./doc-panel";

type Props = {
  profile?: UserProfileState | null;
  profileConfidence?: Record<string, number>;
  plan?: PlanState | null;
  sessionId: string;
  fileRefresh?: number;
  onPlanAction?: (message: string) => void;
  disabled?: boolean;
};

const labels: Record<keyof UserProfileState, string> = {
  ageOrGeneration: "年龄段",
  educationLevel: "教育水平",
  toolAbility: "工具能力",
  aiFamiliarity: "AI 熟悉度",
  researchFamiliarity: "科研理解度",
  interestArea: "兴趣方向",
  currentBlocker: "当前卡点",
  deviceAvailable: "可用设备",
  timeAvailable: "可用时间",
  explanationPreference: "解释偏好",
};

function confidenceBadge(conf: number) {
  if (conf >= 1) return { icon: "●", label: "已确认", cls: "conf-confirmed" };
  if (conf >= 0.7) return { icon: "◉", label: "推断中", cls: "conf-deduced" };
  if (conf >= 0.3) return { icon: "○", label: "猜测中", cls: "conf-inferred" };
  return null;
}

export function SidePanel({
  profile,
  profileConfidence = {},
  plan,
  sessionId,
  fileRefresh,
  onPlanAction,
  disabled,
}: Props) {
  const hasProfile = profile && Object.values(profile).some((v) => v);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  return (
    <div className="side-panel">
      {/* Profile Card */}
      {hasProfile ? (
        <div className="panel">
          <span className="eyebrow">你的画像</span>
          <ul className="profile-list">
            {(Object.entries(labels) as [keyof UserProfileState, string][]).map(
              ([key, label]) => {
                const value = profile[key];
                if (!value) return null;
                const conf = profileConfidence[key] ?? 0;
                const badge = confidenceBadge(conf);
                return (
                  <li key={key} className="profile-item">
                    <span className="profile-label">{label}</span>
                    <span className="profile-value">
                      {value}
                      {badge && (
                        <span className={`profile-badge ${badge.cls}`} title={badge.label}>
                          {" "}{badge.icon}
                        </span>
                      )}
                    </span>
                  </li>
                );
              },
            )}
          </ul>
          <div className="profile-legend">
            <span className="legend-item"><span className="conf-confirmed">●</span> 已确认</span>
            <span className="legend-item"><span className="conf-deduced">◉</span> 推断中</span>
            <span className="legend-item"><span className="conf-inferred">○</span> 猜测中</span>
          </div>
        </div>
      ) : (
        <div className="panel">
          <span className="eyebrow">用户画像</span>
          <p className="muted">对话几轮后，系统会在这里展示对你的理解。</p>
        </div>
      )}

      {/* Plan Panel */}
      {plan ? (
        <PlanPanel plan={plan} onAction={onPlanAction} disabled={disabled} />
      ) : hasProfile ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <span className="eyebrow">Plan 面板</span>
          <p className="muted">继续对话完成问题收敛后，系统将自动生成你的科研探索计划。</p>
        </div>
      ) : null}

      {/* File List */}
      <FileList
        sessionId={sessionId}
        onFileSelect={(f) => setActiveFile(f)}
        refreshTrigger={fileRefresh}
      />

      {/* Doc Preview */}
      <DocPanel
        sessionId={sessionId}
        activeFile={activeFile}
        onClose={() => setActiveFile(null)}
      />
    </div>
  );
}
