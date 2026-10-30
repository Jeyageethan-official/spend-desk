import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  PieChart,
  Settings,
  ShieldCheck,
  Wallet,
  WifiOff,
  Zap,
} from 'lucide-react';
import { SpendDeskLogo } from './SpendDeskLogo';

/** What the form is currently asking for. */
type AuthMode = 'signin' | 'signup' | 'forgot';

interface SignInScreenProps {
  /** Starts the Google sign-in round-trip (must come from a real tap). */
  onSignIn: () => void;
  /** A sign-in is already running (overlay carries the detail). */
  isBusy?: boolean;
  /** Device is offline — sign-in cannot start until the network returns. */
  isOffline?: boolean;
  /** Why the user is here: a session that ended, or an intentional sign-out. */
  notice?: 'session' | 'signed_out' | null;
  /** Password sign-in against Supabase. Google is the fallback when absent. */
  onPasswordSignIn?: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  /** Creates an email + password account (confirmed by email when required). */
  onCreateAccount?: (email: string, password: string, fullName: string) => Promise<{ success: boolean; message?: string; needsConfirmation?: boolean }>;
  /** Emails Supabase's password-reset link to the given address. */
  onForgotPassword?: (email: string) => Promise<{ success: boolean; message?: string }>;
}

/** The real four-colour Google mark, inlined so it never depends on a CDN. */
const GoogleG: React.FC<{ className?: string }> = ({ className = 'h-[18px] w-[18px]' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

/**
 * The dashboard preview card from the design — a dark glassmorphism panel
 * with an icon rail, total balance, glowing trend line and the two metric
 * cards. Purely decorative; drawn with the same lucide icons the app uses.
 * Desktop/tablet only: the phone layout uses the mockup's illustration.
 */
const DashboardPreview: React.FC = () => {
  const railIcons = [LayoutDashboard, BarChart3, Wallet, PieChart, Settings];
  return (
    <div className="relative w-full max-w-[280px] rounded-[20px] border border-white/10 bg-white/[0.06] p-3 shadow-[0_30px_60px_-28px_rgba(0,0,0,0.85)] backdrop-blur-md sm:max-w-[560px]">
      <div className="flex gap-3">
        {/* Icon rail */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-3.5 rounded-2xl bg-white/[0.05] py-3.5">
          {railIcons.map((Icon, i) => (
            <Icon
              key={i}
              className={`h-[15px] w-[15px] ${i === 0 ? 'text-[#4fe0ae]' : 'text-white/55'}`}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {/* Balance row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Total Balance
              </p>
              <p className="mt-1 text-[26px] font-black leading-none tracking-[-0.02em] text-white">
                Rs 4,000
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#2bd98d]/15 px-2 py-[3px] text-[10px] font-bold text-[#5fe3b4]">
                <ArrowUpRight className="h-3 w-3" />
                12.5% this month
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/70">
              Monthly
              <ChevronDown className="h-3 w-3" />
            </span>
          </div>

          {/* Trend line — glowing green, May highlighted */}
          <svg viewBox="0 0 260 72" className="mt-2 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="sd-prev-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2bd98d" stopOpacity="0.35" />
                <stop offset="1" stopColor="#2bd98d" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M10 48C34 44 34 36 58 36s24 6 48 6 24-18 48-18 24 6 48 6 24-16 48-16v58H10Z"
              fill="url(#sd-prev-area)"
            />
            <path
              d="M10 48C34 44 34 36 58 36s24 6 48 6 24-18 48-18 24 6 48 6 24-16 48-16"
              fill="none"
              stroke="#2bd98d"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="[filter:drop-shadow(0_0_5px_rgba(43,217,141,0.8))]"
            />
            {/* May marker */}
            <line
              x1="202"
              y1="30"
              x2="202"
              y2="70"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx="202" cy="30" r="4" fill="#ffffff" />
          </svg>
          <div className="-mt-1 flex justify-between px-0.5 text-[9px] font-semibold text-white/40">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m) => (
              <span key={m} className={m === 'May' ? 'text-white/80' : undefined}>
                {m}
              </span>
            ))}
          </div>

          {/* Metric cards — desktop/tablet only; the mockup's phone card
              shows just the balance and the trend. */}
          <div className="mt-3 hidden grid-cols-2 gap-2 sm:grid">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <ArrowUpRight className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-white/55">Income</p>
                <p className="text-[12.5px] font-black text-white">
                  Rs 12,500{' '}
                  <span className="text-[10px] font-bold text-[#5fe3b4]">↑ 8.2%</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500">
                <ArrowDownRight className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-white/55">Expenses</p>
                <p className="text-[12.5px] font-black text-white">
                  Rs 8,500{' '}
                  <span className="text-[10px] font-bold text-rose-300">↓ 6.1%</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * The phone artwork from the mobile mockup — a phone showing charts, a
 * floating receipt with a rupee mark, a coin and a little plant. Flat SVG so
 * it ships inside the bundle and never depends on an image CDN. Phone widths
 * only, and skipped on short screens where every vertical pixel is form space.
 */
const MobileIllustration: React.FC = () => (
  <div
    className="pointer-events-none absolute right-0 top-[66px] z-0 h-[178px] w-[162px] select-none sm:hidden [@media(max-height:790px)]:hidden"
    aria-hidden="true"
  >
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <defs>
        <linearGradient id="mi-phone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b3b2c" />
          <stop offset="1" stopColor="#05231a" />
        </linearGradient>
        <linearGradient id="mi-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f5c44" />
          <stop offset="1" stopColor="#0a3f30" />
        </linearGradient>
        <radialGradient id="mi-blob" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#4fe0ae" stopOpacity="0.32" />
          <stop offset="1" stopColor="#4fe0ae" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft glow behind everything */}
      <circle cx="112" cy="104" r="84" fill="url(#mi-blob)" />

      {/* potted plant */}
      <g transform="translate(146 128)">
        <path d="M13 34h16l-3 24H16z" fill="#f4faf7" />
        <path d="M11 31h20l-2 6H13z" fill="#ffffff" />
        <path d="M21 32c0-13 6-21 15-25 1 13-5 22-15 25z" fill="#3ddc9a" />
        <path d="M21 32c-2-11-9-17-18-19 2 11 9 18 18 19z" fill="#2bbd8a" />
        <path d="M21 33c0-8 3-14 8-18-1 10-4 16-8 18z" fill="#7ff2cc" />
      </g>

      {/* phone */}
      <g transform="rotate(-6 100 108)">
        <rect x="58" y="38" width="86" height="140" rx="16" fill="url(#mi-phone)" />
        <rect x="63" y="43" width="76" height="130" rx="12" fill="url(#mi-screen)" />
        <rect x="70" y="52" width="32" height="6" rx="3" fill="#ffffff" opacity="0.45" />
        <rect x="70" y="62" width="50" height="10" rx="5" fill="#ffffff" opacity="0.85" />
        <circle cx="121" cy="66" r="12" fill="none" stroke="#4fe0ae" strokeWidth="5" strokeDasharray="46 30" transform="rotate(-90 121 66)" />
        <rect x="70" y="120" width="9" height="24" rx="3" fill="#4fe0ae" opacity="0.65" />
        <rect x="83" y="110" width="9" height="34" rx="3" fill="#4fe0ae" opacity="0.85" />
        <rect x="96" y="126" width="9" height="18" rx="3" fill="#4fe0ae" opacity="0.55" />
        <rect x="109" y="104" width="9" height="40" rx="3" fill="#4fe0ae" />
        <path
          d="M70 106c12-8 20 0 30-10s18-12 30-8"
          fill="none"
          stroke="#7cf5cd"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="130" cy="88" r="4" fill="#ffffff" />
      </g>

      {/* floating receipt with the rupee mark */}
      <g transform="rotate(8 46 66)">
        <rect x="20" y="34" width="52" height="64" rx="8" fill="#ffffff" />
        <text x="30" y="60" fontSize="22" fontWeight="800" fill="#0f8a68">₹</text>
        <rect x="30" y="68" width="32" height="4" rx="2" fill="#cfe9de" />
        <rect x="30" y="76" width="22" height="4" rx="2" fill="#cfe9de" />
        <rect x="30" y="84" width="27" height="4" rx="2" fill="#cfe9de" />
      </g>

      {/* coin */}
      <circle cx="164" cy="58" r="13" fill="#4fe0ae" />
      <text x="164" y="64" textAnchor="middle" fontSize="15" fontWeight="800" fill="#05231a">₹</text>
    </svg>
  </div>
);

/** Quiet background detail for the open lower portion of the desktop brand panel. */
const DesktopBrandTexture: React.FC = () => (
  <div className="pointer-events-none absolute inset-x-0 bottom-16 hidden h-[270px] overflow-hidden lg:block" aria-hidden="true">
    <svg viewBox="0 0 900 270" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="sd-brand-wave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4fe0ae" stopOpacity="0" />
          <stop offset="0.42" stopColor="#4fe0ae" stopOpacity="0.15" />
          <stop offset="1" stopColor="#4fe0ae" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="sd-brand-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fe0ae" stopOpacity="0.08" />
          <stop offset="1" stopColor="#4fe0ae" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 177C75 163 103 186 179 161s91-51 165-30 96 6 157-33 111-13 164-44 125-42 235-20v185H0Z" fill="url(#sd-brand-fill)" />
      <path d="M0 177C75 163 103 186 179 161s91-51 165-30 96 6 157-33 111-13 164-44 125-42 235-20" fill="none" stroke="url(#sd-brand-wave)" strokeWidth="2" />
      <path d="M0 214H900M0 154H900M0 94H900" stroke="rgba(255,255,255,0.045)" strokeWidth="1" strokeDasharray="4 8" />
      <circle cx="501" cy="98" r="4" fill="#4fe0ae" fillOpacity="0.3" />
      <circle cx="665" cy="54" r="4" fill="#4fe0ae" fillOpacity="0.22" />
    </svg>
  </div>
);

/**
 * The sign-in gate — splash → this page → Google sign-in → the three-step
 * Sheet onboarding → dashboard. Signing out lands back here.
 *
 * Follows the approved design exactly: a dark green gradient brand panel
 * (logo, headline, subheadline, dashboard preview / illustration, trust
 * badges) beside a white form sheet (Welcome back · email · password ·
 * Sign In · Google).
 *
 * The form also does real email+password work through Supabase: sign in,
 * create an account, and email a password-reset link ("Forgot password?").
 */
export const SignInScreen: React.FC<SignInScreenProps> = ({
  onSignIn,
  isBusy = false,
  isOffline = false,
  notice = null,
  onPasswordSignIn,
  onCreateAccount,
  onForgotPassword,
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // A sign-out is a normal return to the login form, not an alert. Only an
  // offline device needs an actionable message here.
  const noticeText = isOffline
    ? "You're offline. Reconnect to sign in."
    : null;

  const badges = [
    { Icon: ShieldCheck, line1: 'Secure', line2: 'and private' },
    { Icon: Zap, line1: 'Access', line2: 'your data anytime' },
    { Icon: Cloud, line1: 'Sync across', line2: 'all your devices' },
  ];

  const busy = localBusy || isBusy;

  const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const passwordIssue = (value: string): string | null => {
    if (value.length < 8) return 'Use at least 8 characters.';
    if (!/[a-z]/.test(value)) return 'Add at least one lowercase letter.';
    if (!/[A-Z]/.test(value)) return 'Add at least one uppercase letter.';
    if (!/\d/.test(value)) return 'Add at least one number.';
    return null;
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setInfo(null);
    const mail = email.trim();

    if (mode === 'forgot') {
      if (!mail) {
        setError('Enter your email address first.');
        return;
      }
      if (!validEmail(mail)) {
        setError('Enter a valid email address.');
        return;
      }
      if (!onForgotPassword) {
        await onSignIn();
        return;
      }
      setLocalBusy(true);
      const res = await onForgotPassword(mail);
      setLocalBusy(false);
      if (res.success) setSentTo(mail);
      else setError(res.message || 'We could not send the reset email.');
      return;
    }

    if (!mail) {
      setError('Enter your email address.');
      return;
    }
    if (!validEmail(mail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setError('Enter your name.');
      return;
    }
    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Name must contain at least 2 characters.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (mode === 'signup') {
      const issue = passwordIssue(password);
      if (issue) {
        setError(`Password needs more strength: ${issue}`);
        return;
      }
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (mode === 'signin') {
      if (!onPasswordSignIn) {
        await onSignIn();
        return;
      }
      setLocalBusy(true);
      const res = await onPasswordSignIn(mail, password);
      setLocalBusy(false);
      if (!res.success) setError(res.message || 'Could not sign in. Please try again.');
      return;
    }

    // sign-up
    if (!onCreateAccount) {
      await onSignIn();
      return;
    }
    setLocalBusy(true);
    const res = await onCreateAccount(mail, password, fullName.trim());
    setLocalBusy(false);
    if (!res.success) {
      setError(res.message || 'Could not create the account.');
      return;
    }
    if (res.needsConfirmation) {
      setMode('signin');
      setPassword('');
      setInfo(res.message || `Check your inbox — we sent a confirmation link to ${mail}.`);
    }
    // otherwise the session is live and the app opens on its own
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setSentTo(null);
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const headline =
    mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back';
  const subline =
    mode === 'signup'
      ? 'Start tracking your money in seconds'
      : mode === 'forgot'
        ? 'We will email you a secure reset link'
        : 'Sign in to continue to SpendDesk';

  return (
    <div className="min-h-screen w-full bg-[#f0f4f5] text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row lg:items-stretch">
        {/* ── Brand panel ───────────────────────────────────────────────── */}
        <aside className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#0f8a68_0%,#0a4a37_40%,#051711_100%)] text-white lg:flex lg:w-[52%] lg:min-w-0 lg:flex-col lg:justify-between lg:px-14 lg:pb-12 lg:pt-11 lg:[@media(max-height:820px)]:pb-8 lg:[@media(max-height:820px)]:pt-7 xl:px-16">
          {/* Soft aura for depth */}
          <div
            className="pointer-events-none absolute -left-20 -top-24 h-96 w-96 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(43,217,141,0.22), rgba(43,217,141,0) 65%)' }}
            aria-hidden="true"
          />
          <DesktopBrandTexture />

          {/* Mockup artwork — phone only, behind the copy */}
          {/* Artwork uses the full width of the green panel on desktop. */}
          <div className="relative z-10 w-full max-w-[720px]">
            <div className="flex items-center gap-2.5">
              <SpendDeskLogo variant="icon" size="md" />
              <span className="text-[19px] font-black tracking-tight text-white">SpendDesk</span>
            </div>

            <h1 className="mt-3 max-w-[13ch] text-[22px] font-black leading-[1.08] tracking-[-0.03em] sm:text-4xl lg:mt-8 lg:text-[42px] lg:[@media(max-height:820px)]:mt-4 lg:[@media(max-height:820px)]:text-[36px]">
              Every rupee,
              <br />
              <span className="text-[#4fe0ae]">accounted for.</span>
            </h1>
            <p className="mt-1.5 max-w-[62%] text-[12px] leading-snug text-white/60 sm:mt-3 sm:max-w-[34ch] sm:text-sm lg:mt-3">
              Manage your income, control your expenses and build a better financial future.
            </p>

            {/* Phone mockup has no preview card — the illustration carries the
                panel, and this spacer sets the panel height so the white sheet
                starts where the design puts it. Skipped on short screens. */}
            <div
              className="h-[104px] sm:hidden [@media(max-height:790px)]:hidden"
              aria-hidden="true"
            />

            {/* Dashboard preview — tablet/desktop only */}
            <div className="mt-3 hidden justify-center sm:mt-5 sm:flex lg:mt-8 lg:[@media(max-height:820px)]:mt-4 lg:justify-start">
              <DashboardPreview />
            </div>
          </div>

          {/* Trust badges — desktop only */}
          <div className="relative z-10 mt-10 hidden w-full max-w-[720px] items-center gap-8 lg:flex lg:[@media(max-height:820px)]:mt-6">
            {badges.map(({ Icon, line1, line2 }) => (
              <div key={line1} className="flex items-center gap-2.5">
                <Icon className="h-[18px] w-[18px] shrink-0 text-[#4fe0ae]" />
                <div className="leading-tight">
                  <p className="text-[12.5px] font-bold text-white">{line1}</p>
                  <p className="text-[11.5px] text-white/50">{line2}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Sign-in form ──────────────────────────────────────────────── */}
        <main className="relative z-10 min-w-0 bg-white px-6 py-10 sm:px-8 sm:py-12 lg:mt-0 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:self-stretch lg:px-14 lg:py-12 xl:px-20">
          <div className="mx-auto w-full max-w-[380px] animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="mb-10 flex items-center justify-center lg:hidden">
              <SpendDeskLogo variant="app-icon" size="xl" />
            </div>
            <h2 className="text-center text-[22px] font-black tracking-[-0.02em] text-slate-900 sm:text-[26px]">
              {headline}
            </h2>
            <p className="mt-1 text-center text-[13px] text-slate-500 sm:text-sm">{subline}</p>

            {noticeText && (
              <div
                className={`mt-4 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[12.5px] leading-snug ${
                  isOffline
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
                role="status"
              >
                {isOffline && <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{noticeText}</span>
              </div>
            )}

            {/* Confirmation sent / inline error */}
            {info && (
              <div
                className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-emerald-700"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{info}</span>
              </div>
            )}
            {error && (
              <div
                className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-rose-600"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Reset link sent — replaces the form until they go back */}
            {mode === 'forgot' && sentTo ? (
              <div className="mt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Mail className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="mt-4 text-[15px] font-bold text-slate-900">Check your email</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  We sent a password reset link to <span className="font-semibold text-slate-700">{sentTo}</span>.
                  Open it on this device to choose a new password.
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10b77f] text-[15px] font-bold text-white shadow-[0_10px_24px_-12px_rgba(16,183,127,0.9)] transition-all hover:bg-[#0ea372] active:scale-[0.99] cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to sign in</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSentTo(null);
                    setError(null);
                  }}
                  className="mt-3 block w-full text-center text-xs font-semibold text-teal-600 transition-colors hover:text-teal-700 cursor-pointer"
                >
                  Resend the link
                </button>
              </div>
            ) : (
              <>
                {mode === 'signup' && (
                  <div className="mt-4 sm:mt-6">
                    <label htmlFor="signup-name" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                      Name
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your name"
                      autoComplete="name"
                      aria-label="Name"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white sm:h-12"
                    />
                  </div>
                )}
                {/* Email */}
                <div className={`${mode === 'signup' ? 'mt-2.5 sm:mt-3' : 'mt-4 sm:mt-6'}`}>
                  {mode === 'signup' && (
                    <label htmlFor="signup-email" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                      Email address
                    </label>
                  )}
                  <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id={mode === 'signup' ? 'signup-email' : undefined}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    autoComplete="email"
                    aria-label="Email address"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white sm:h-12"
                  />
                  </div>
                </div>

                {/* Password — the reset flow only needs the address */}
                {mode !== 'forgot' && (
                  <>
                    <div className="mt-2.5 sm:mt-3">
                      {mode === 'signup' && (
                        <label htmlFor="signup-password" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                          Password
                        </label>
                      )}
                      <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id={mode === 'signup' ? 'signup-password' : undefined}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'signup' ? 'Create a secure password' : 'Enter your password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        aria-label={mode === 'signup' ? 'New password' : 'Password'}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white sm:h-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      </div>
                      {mode === 'signup' && (
                        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                          Use 8+ characters with uppercase, lowercase, and a number.
                        </p>
                      )}
                    </div>

                    {mode === 'signup' && (
                      <div className="mt-2.5 sm:mt-3">
                        <label htmlFor="signup-confirm-password" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                          Confirm password
                        </label>
                        <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="signup-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm your password"
                          autoComplete="new-password"
                          aria-label="Confirm password"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white sm:h-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        </div>
                      </div>
                    )}

                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="mt-2.5 block w-full text-right text-xs font-semibold text-teal-600 transition-colors hover:text-teal-700 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </>
                )}

                {mode === 'forgot' && (
                  <div className="mt-4" />
                )}

                {/* Primary action */}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || isOffline}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10b77f] text-[15px] font-bold text-white shadow-[0_10px_24px_-12px_rgba(16,183,127,0.9)] transition-all hover:bg-[#0ea372] active:scale-[0.99] cursor-pointer disabled:pointer-events-none disabled:opacity-60 sm:h-12"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-[18px] w-[18px] animate-spin" />
                      <span>{mode === 'forgot' ? 'Sending…' : mode === 'signup' ? 'Creating…' : 'Signing in…'}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === 'forgot' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign In'}
                      </span>
                      <span aria-hidden="true">{mode === 'forgot' ? '→' : '→'}</span>
                    </>
                  )}
                </button>

                {/* Divider + Google — the account may also live behind Google */}
                {mode !== 'forgot' && (
                  <>
                    <div className="my-3.5 flex items-center gap-3 sm:my-5">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        or continue with
                      </span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={onSignIn}
                      disabled={isBusy || isOffline}
                      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-[14px] font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] cursor-pointer disabled:pointer-events-none disabled:opacity-60 sm:h-12"
                    >
                      <GoogleG className="h-[18px] w-[18px]" />
                      <span>Continue with Google</span>
                    </button>
                  </>
                )}

                {/* Mode switcher */}
                <p className="mt-4 text-center text-[13px] text-slate-500 sm:mt-6">
                  {mode === 'signup' ? (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="font-bold text-teal-600 transition-colors hover:text-teal-700 cursor-pointer"
                      >
                        Sign in
                      </button>
                    </>
                  ) : mode === 'forgot' ? (
                    <>
                      Remembered it?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="font-bold text-teal-600 transition-colors hover:text-teal-700 cursor-pointer"
                      >
                        Back to sign in
                      </button>
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signup')}
                        className="font-bold text-teal-600 transition-colors hover:text-teal-700 cursor-pointer"
                      >
                        Sign up
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SignInScreen;
