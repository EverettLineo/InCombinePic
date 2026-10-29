import { useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  onCommit: (v: number) => void;
}

/** 数值输入：失焦/回车应用，Esc 取消。编辑中文本优先，避免每敲一键就产生一次撤销 */
function NumberField({ label, value, min, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function apply() {
    const v = Number(text);
    if (!Number.isFinite(v)) {
      setText(String(value));
      return;
    }
    const next = min !== undefined ? Math.max(min, v) : v;
    if (next !== value) onCommit(next);
    else setText(String(value));
  }

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export { NumberField };
