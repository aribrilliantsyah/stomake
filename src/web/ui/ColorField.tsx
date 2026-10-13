import { useEffect, useState } from 'react';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** One control: swatch (native picker) + hex text, same height/width as other inputs. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  return (
    <div className="color-field">
      <label className="color-swatch" style={{ background: value }} title="Pilih warna">
        <input type="color" value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label ?? 'Warna'} />
      </label>
      <input
        className="mono"
        value={draft}
        maxLength={7}
        spellCheck={false}
        aria-label={label ? `${label} (hex)` : 'Hex'}
        onChange={(e) => {
          const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
          setDraft(v.toUpperCase());
          if (HEX.test(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setDraft(value.toUpperCase())}
      />
    </div>
  );
}
