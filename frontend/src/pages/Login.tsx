import React, {type FormEvent, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {motion} from 'motion/react';
import {LogIn} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardFooter} from '@/components/ui/card';
import {useAuth} from '@/contexts/AuthContext';
import {useI18n} from '@/contexts/I18nContext';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('login.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Mobile-only brand header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 flex items-center gap-3 md:hidden"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground shadow-[0_10px_20px_rgba(21,94,99,0.16)]">
          J
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">Business Agent Workspace</p>
          <p className="text-base font-bold tracking-[-0.02em]">机灵平台</p>
        </div>
      </motion.div>

      {/* Form header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">{t('login.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('login.desc')}</p>
      </div>

      {/* Form card */}
      <Card className="overflow-hidden border-white/70 bg-[rgba(255,253,250,0.96)] shadow-[0_18px_42px_-28px_rgba(20,32,43,0.16)]">
        <div className="h-1 bg-[linear-gradient(90deg,#155E63_0%,#155E63_52%,#D89B2B_52%,#D89B2B_68%,transparent_68%)]" />
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-5">
            {error && (
              <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <label
              htmlFor="remember"
              className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-border/60 bg-background/30 px-3 py-2.5"
            >
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground/80">{t('login.remember')}</span>
            </label>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-1">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>{t('login.loading')}</>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  {t('login.submit')}
                </>
              )}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('login.noAccount')}{' '}
              <Link to="/register" className="font-medium text-primary hover:underline">
                {t('login.register')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
