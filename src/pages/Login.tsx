
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { nextPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { LogIn, Mail, Lock, Eye, EyeOff, ShieldPlus, Dumbbell, HeartPulse, Flame, Trophy, Timer, Activity } from 'lucide-react';
import { useTranslation, tr } from '@/lib/i18n';
import { CreateAdminDialog } from '@/components/auth/CreateAdminDialog';

const floatingIcons = [
  { Icon: Dumbbell, className: 'top-[12%] start-[8%] w-10 h-10', delay: '0s' },
  { Icon: HeartPulse, className: 'top-[22%] end-[10%] w-8 h-8', delay: '1.2s' },
  { Icon: Flame, className: 'bottom-[18%] start-[14%] w-9 h-9', delay: '2.4s' },
  { Icon: Trophy, className: 'bottom-[10%] end-[18%] w-10 h-10', delay: '0.6s' },
  { Icon: Timer, className: 'top-[55%] start-[4%] w-7 h-7', delay: '1.8s' },
  { Icon: Activity, className: 'top-[6%] end-[38%] w-7 h-7', delay: '3s' },
];

const loginStyles = `
  @keyframes login-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-18px) rotate(8deg); } }
  @keyframes login-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes login-pulse-ring { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.6); opacity: 0; } }
  @keyframes login-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @keyframes login-lift { 0%,100% { transform: translateY(0) rotate(-12deg); } 50% { transform: translateY(-10px) rotate(-12deg); } }
  .login-float { animation: login-float 6s ease-in-out infinite; }
  .login-rise { opacity: 0; animation: login-rise .7s cubic-bezier(.2,.8,.2,1) forwards; }
  .login-ring::before, .login-ring::after { content: ''; position: absolute; inset: 0; border-radius: 9999px; border: 2px solid #facc15; animation: login-pulse-ring 2.4s ease-out infinite; }
  .login-ring::after { animation-delay: 1.2s; }
  .login-shine { background-image: linear-gradient(110deg, #facc15 40%, #fff7c2 50%, #facc15 60%); background-size: 200% 100%; animation: login-shine 3s linear infinite; }
  .login-lift { animation: login-lift 3s ease-in-out infinite; }
  .login-grid { background-image: linear-gradient(rgba(250,204,21,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,.06) 1px, transparent 1px); background-size: 40px 40px; }
  @media (prefers-reduced-motion: reduce) {
    .login-float, .login-rise, .login-ring::before, .login-ring::after, .login-shine, .login-lift { animation: none !important; opacity: 1; }
  }
`;

const inputClass = 'h-12 ps-11 rounded-xl bg-black/60 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-yellow-400/50 focus-visible:border-yellow-400 transition-all';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  // null = still checking; the button only appears once we know no admin exists.
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('admin_exists').then(({ data, error }) => {
      if (!active) return;
      // On error (e.g. schema not installed yet) show the button so setup is possible.
      setAdminExists(error ? false : data === true);
    });
    return () => { active = false; };
  }, []);
  const { login, isLoading, language, storeSettings } = useAuth();
  const { t } = useTranslation(language);
  const gymName = storeSettings?.name || 'GYM';
  const logo = storeSettings?.logo_url;
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: t('common.error'),
        description: t('validation.required'),
        variant: "destructive",
      });
      return;
    }

    const result = await login(email, password);

    if (result.status === 'ok') {
      toast({
        title: t('login.welcomeBack'),
        description: t('common.success'),
      });
      navigate(nextPath(window.location.search));
      return;
    }

    if (result.status === 'inactive') {
      toast({
        title: t('common.error'),
        description: tr('Ce compte n’est lié à aucun employé actif. Contactez un administrateur.', 'هذا الحساب غير مرتبط بعامل نشط. اتصل بالمسؤول.'),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t('common.error'),
      description: result.message || t('login.enterCredentials'),
      variant: "destructive",
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex relative overflow-hidden">
      <style>{loginStyles}</style>

      {/* Background */}
      <div className="absolute inset-0 login-grid" />
      <div className="absolute -top-32 -start-32 w-96 h-96 bg-yellow-400/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -end-40 w-[28rem] h-[28rem] bg-yellow-500/10 rounded-full blur-3xl" />
      {floatingIcons.map(({ Icon, className, delay }, i) => (
        <Icon key={i} className={`absolute text-yellow-400/15 login-float pointer-events-none ${className}`} style={{ animationDelay: delay }} />
      ))}

      {/* Hero panel (desktop only) */}
      <div className="hidden lg:flex relative z-10 w-1/2 flex-col justify-between p-12 border-e border-yellow-400/10">
        <div className="flex items-center gap-3 login-rise" style={{ animationDelay: '.1s' }}>
          <div className="w-11 h-11 rounded-xl bg-yellow-400 flex items-center justify-center overflow-hidden">
            {logo ? <img src={logo} alt="logo" className="w-full h-full object-cover" /> : <Dumbbell className="w-6 h-6 text-black" />}
          </div>
          <span className="text-xl font-extrabold tracking-wider uppercase">{gymName}</span>
        </div>

        <div className="space-y-6">
          <div className="login-lift inline-flex w-24 h-24 rounded-3xl bg-yellow-400 items-center justify-center shadow-[0_0_60px_rgba(250,204,21,.35)]">
            <Dumbbell className="w-14 h-14 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl xl:text-6xl font-black leading-[1.05] uppercase login-rise" style={{ animationDelay: '.25s' }}>
            {tr('Plus fort', 'أقوى')}<br />
            <span className="login-shine bg-clip-text text-transparent">{tr('chaque jour', 'كل يوم')}</span>
          </h1>
          <p className="text-white/60 max-w-md text-lg login-rise" style={{ animationDelay: '.4s' }}>
            {tr('Gérez vos athlètes, abonnements et accès en un seul endroit.', 'أدر رياضييك واشتراكاتك والدخول في مكان واحد.')}
          </p>
          <div className="flex flex-wrap gap-3 login-rise" style={{ animationDelay: '.55s' }}>
            {[
              { Icon: Activity, label: tr('Présences', 'الحضور') },
              { Icon: Trophy, label: tr('Abonnements', 'الاشتراكات') },
              { Icon: HeartPulse, label: tr('Athlètes', 'الرياضيون') },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-yellow-400/20 text-sm text-white/80 hover:border-yellow-400/60 hover:bg-yellow-400/10 transition-colors">
                <Icon className="w-4 h-4 text-yellow-400" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30 tracking-widest uppercase">No pain · No gain</p>
      </div>

      {/* Form panel */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md login-rise" style={{ animationDelay: '.15s' }}>
          <div className="relative rounded-3xl bg-[#121212]/90 backdrop-blur-xl border border-yellow-400/20 shadow-[0_20px_80px_-20px_rgba(250,204,21,.25)] p-8 sm:p-10">
            <div className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-yellow-400 to-transparent" />

            <div className="text-center mb-8">
              <div className="relative mx-auto w-20 h-20 mb-5 login-ring">
                <div className="relative w-20 h-20 rounded-full bg-yellow-400 flex items-center justify-center overflow-hidden">
                  {logo ? <img src={logo} alt="logo" className="w-full h-full object-cover" /> : <Dumbbell className="w-10 h-10 text-black" strokeWidth={2.5} />}
                </div>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-wide">{gymName}</h2>
              <p className="text-white/50 mt-1">{t('login.signIn')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2 login-rise" style={{ animationDelay: '.3s' }}>
                <Label htmlFor="email" className="text-white/70 text-xs uppercase tracking-wider">{t('common.email')}</Label>
                <div className="relative group">
                  <Mail className="absolute start-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-yellow-400 transition-colors w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('common.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2 login-rise" style={{ animationDelay: '.42s' }}>
                <Label htmlFor="password" className="text-white/70 text-xs uppercase tracking-wider">{t('common.password')}</Label>
                <div className="relative group">
                  <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-yellow-400 transition-colors w-4 h-4" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t('common.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pe-11`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-yellow-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="group w-full h-12 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold uppercase tracking-wider shadow-[0_8px_30px_rgba(250,204,21,.35)] hover:shadow-[0_12px_40px_rgba(250,204,21,.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all login-rise"
                style={{ animationDelay: '.54s' }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Dumbbell className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4 me-2 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                    {t('login.signInButton')}
                  </>
                )}
              </Button>
            </form>

            {/*
              Only shown until the first administrator exists. bootstrap_admin
              also refuses at the database level once one exists.
            */}
            {adminExists === false && (
            <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
              <p className="text-xs text-white/40 text-center leading-relaxed">
                {tr('Première installation ? Créez le compte administrateur.', 'أول تثبيت؟ أنشئ حساب المسؤول.')}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl bg-transparent border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300"
                onClick={() => setShowCreateAdmin(true)}
              >
                <ShieldPlus className="w-4 h-4 me-2" />
                {tr('Créer le compte administrateur', 'إنشاء حساب المسؤول')}
              </Button>
            </div>
            )}
          </div>
        </div>
      </div>

      <CreateAdminDialog
        isOpen={showCreateAdmin}
        onClose={() => setShowCreateAdmin(false)}
        onCreated={(createdEmail) => {
          // Prefill the email so the new admin can sign in right away.
          setEmail(createdEmail);
          setAdminExists(true);
        }}
      />
    </div>
  );
};
