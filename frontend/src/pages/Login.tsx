import React, {type FormEvent, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {LogIn} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
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
      {/* Form header */}
      <div className="mb-8">
        <h2 className="text-[1.75rem] font-bold tracking-[-0.03em]">{t('login.title')}</h2>
      </div>

      {/* Form — no Card wrapper */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
            {t('login.email')}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-11 bg-white/80 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
            {t('login.password')}
          </Label>
          <Input
            id="password"
            type="password"
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-11 bg-white/80 text-base"
          />
        </div>

        <label htmlFor="remember" className="flex cursor-pointer items-center gap-2.5">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground/70">{t('login.remember')}</span>
        </label>

        <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
          {submitting ? (
            t('login.loading')
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
      </form>
    </div>
  );
}
