import { useState, useRef, useEffect } from "react";
import { Palette, Check } from "lucide-react";
import { THEMES, type KnifeTheme } from "~/utils/themes";

interface ThemeSelectorProps {
  currentTheme: KnifeTheme;
  onSelectTheme: (themeId: string) => void;
}

export function ThemeSelector({ currentTheme, onSelectTheme }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors cursor-pointer"
        title="Switch Theme"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{currentTheme.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-xs font-semibold text-[var(--fg-muted)] tracking-wider uppercase border-b border-[var(--border)] mb-1">
            Themes
          </div>
          <div className="flex flex-col gap-0.5">
            {THEMES.map((theme) => {
              const isSelected = theme.id === currentTheme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    onSelectTheme(theme.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[var(--bg-active)] text-[var(--accent)] font-semibold"
                      : "text-[var(--fg-base)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Color dots preview */}
                    <div className="flex items-center -space-x-1">
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: theme.ui.bgBase }}
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: theme.ui.accent }}
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: theme.ui.statusOk }}
                      />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
