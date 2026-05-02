"use client";

type Props = {
  questions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
};

/** Filter out placeholder-like options ("选项A", "其他", etc.) */
function isValidOption(q: string): boolean {
  if (q.length < 3) return false;
  if (/^选项\s*[a-dA-D]$/.test(q.trim())) return false;
  if (/^[a-dA-D][).、]/.test(q.trim())) return false;
  if (q.trim() === "其他" || q.trim() === "其它") return false;
  if (/[：:].*[A-D][.)].*[A-D][.)]/.test(q)) return false;
  return true;
}

export function ChoiceButtons({ questions, onSelect, disabled }: Props) {
  const valid = questions.filter(isValidOption);

  // Always show escape hatch unless already present
  const hasEscape = valid.some(
    (q) =>
      q.includes("帮我找方向") ||
      q.includes("自己描述") ||
      q.includes("自定义"),
  );

  const display = hasEscape ? valid : [...valid, "我不太理解这些，帮我找方向"];

  if (display.length === 0) return null;

  return (
    <div className="choice-buttons">
      {display.map((q, i) => (
        <button
          key={i}
          className={`button button-choice${!hasEscape && i === display.length - 1 ? " button-choice-escape" : ""}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
