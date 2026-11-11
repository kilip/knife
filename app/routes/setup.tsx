import { useState, useEffect } from "react";
import { Copy, Check, ShieldCheck, ArrowRight } from "lucide-react";
import { THEMES, applyTheme } from "~/utils/themes";

export default function Setup() {
  const [token, setToken] = useState("");
  const [publicDomain, setPublicDomain] = useState("");
  const [publicScheme, setPublicScheme] = useState<"https" | "http">("https");
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [allowedUsername, setAllowedUsername] = useState("");
  const [themeId, setThemeId] = useState("catppuccin-mocha");
  const [trustedProxies, setTrustedProxies] = useState(
    "127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16",
  );

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Read ?token= from URL if present
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
    }

    // Default publicDomain to current window host if not already filled
    if (window.location.host && !publicDomain) {
      setPublicDomain(window.location.host);
      setPublicScheme(window.location.protocol === "https:" ? "https" : "http");
    }

    // Check if setup already complete
    fetch("/api/config/public")
      .then((res) => res.json())
      .then((data) => {
        if (!data.isFirstRun) {
          window.location.href = "/login";
        }
      })
      .catch(() => {});
  }, []);

  const handleThemeChange = (newThemeId: string) => {
    setThemeId(newThemeId);
    applyTheme(newThemeId);
  };

  const calculatedCallbackUrl = publicDomain
    ? `${publicScheme}://${publicDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/auth/github/callback`
    : `${publicScheme}://<your-public-domain>/auth/github/callback`;

  const handleCopyCallback = () => {
    navigator.clipboard.writeText(calculatedCallbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const proxiesArray = trustedProxies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          publicDomain,
          publicScheme,
          githubClientId,
          githubClientSecret,
          allowedUsername,
          theme: themeId,
          trustedProxies: proxiesArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Setup failed. Please check inputs.");
      }

      window.location.href = data.redirect || "/login";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[var(--bg-base)] text-[var(--fg-base)] flex flex-col justify-center items-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 sm:p-8 my-8">
        {/* Header */}
        <div className="flex items-center gap-3 pb-6 border-b border-[var(--border)]">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shadow-inner">
            <span className="text-2xl select-none leading-none" role="img" aria-label="knife">
              🔪
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-mono">Knife Setup 🔪</h1>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5">
              Configure your single-user persistent web terminal
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--status-err)]/15 border border-[var(--status-err)]/30 text-[var(--status-err)] text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          {/* Setup Token */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
              One-Time Setup Token <span className="text-[var(--status-err)]">*</span>
            </label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token printed in server console"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] font-mono focus:border-[var(--accent)] outline-none transition-colors"
            />
            <p className="text-[11px] text-[var(--fg-muted)] mt-1">
              Found in the server terminal output on first boot.
            </p>
          </div>

          {/* Public Domain & Scheme */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
                Public Domain <span className="text-[var(--status-err)]">*</span>
              </label>
              <input
                type="text"
                required
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                placeholder="knife.example.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
                Scheme
              </label>
              <select
                value={publicScheme}
                onChange={(e) => setPublicScheme(e.target.value as "https" | "http")}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] focus:border-[var(--accent)] outline-none transition-colors cursor-pointer"
              >
                <option value="https">HTTPS (recommended)</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          {/* Exact OAuth Callback URL Copy Box */}
          <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-muted)] mb-1.5">
              <span>GitHub OAuth Authorization Callback URL</span>
              <button
                type="button"
                onClick={handleCopyCallback}
                className="flex items-center gap-1 text-[var(--accent)] hover:opacity-80 transition-opacity cursor-pointer font-sans"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy URL"}</span>
              </button>
            </div>
            <div className="p-2 rounded-md bg-[var(--bg-base)] text-[11px] font-mono text-[var(--accent)] break-all border border-[var(--border)]">
              {calculatedCallbackUrl}
            </div>
            <p className="text-[10px] text-[var(--fg-muted)] mt-1.5">
              Paste this exact URL into your GitHub OAuth App settings under &quot;Authorization
              callback URL&quot;.
            </p>
          </div>

          {/* GitHub OAuth Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
                GitHub Client ID <span className="text-[var(--status-err)]">*</span>
              </label>
              <input
                type="text"
                required
                value={githubClientId}
                onChange={(e) => setGithubClientId(e.target.value)}
                placeholder="Ov23..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] font-mono focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
                GitHub Client Secret <span className="text-[var(--status-err)]">*</span>
              </label>
              <input
                type="password"
                required
                value={githubClientSecret}
                onChange={(e) => setGithubClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] font-mono focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
          </div>

          {/* Authorized Username */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
              Allowed GitHub Username <span className="text-[var(--status-err)]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={allowedUsername}
                onChange={(e) => setAllowedUsername(e.target.value)}
                placeholder="octocat"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <span className="absolute right-3 top-2.5 text-[var(--fg-muted)]">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--fg-muted)] mt-1">
              Only this GitHub account will be granted access to your terminal.
            </p>
          </div>

          {/* Theme Selection */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
              Default Theme
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const isSelected = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleThemeChange(t.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--bg-elevated)] text-[var(--accent)] font-semibold"
                        : "border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: t.ui.bgBase }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trusted Reverse Proxy CIDRs */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg-base)] uppercase tracking-wider mb-1.5">
              Trusted Reverse Proxy IPs / CIDRs
            </label>
            <input
              type="text"
              value={trustedProxies}
              onChange={(e) => setTrustedProxies(e.target.value)}
              placeholder="127.0.0.1, ::1"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] font-mono focus:border-[var(--accent)] outline-none transition-colors"
            />
            <p className="text-[11px] text-[var(--fg-muted)] mt-1">
              Knife will trust X-Forwarded-* headers ONLY when forwarded by these proxy addresses.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg-base)] font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-md"
          >
            <span>{loading ? "Saving Configuration..." : "Complete Setup & Continue"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
