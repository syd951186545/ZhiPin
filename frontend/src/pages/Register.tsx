import React, {type FormEvent, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Eye, EyeOff, UserPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useAuth} from '@/contexts/AuthContext';
import {useI18n} from '@/contexts/I18nContext';

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password, name, companyName);
      navigate('/');
    } catch {
      setError(t('register.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Form header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">
          Workspace Setup
        </p>
        <h1 className="mt-1.5 text-[1.75rem] font-bold tracking-[-0.03em]">
          {t('register.title')}
        </h1>
      </div>

      {/* Form — no Card wrapper */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="companyName" className="text-sm font-medium text-foreground/80">
            {t('register.companyName')}
          </Label>
          <Input
            id="companyName"
            type="text"
            placeholder={t('register.companyNamePlaceholder')}
            value={companyName}
            onChange={(e) => { e.target.setCustomValidity(''); setCompanyName(e.target.value); }}
            onInvalid={(e) => { (e.target as HTMLInputElement).setCustomValidity(t('validation.fieldRequired')); }}
            required
            className="h-11 bg-white/80 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-foreground/80">
            {t('register.name')}
          </Label>
          <Input
            id="name"
            type="text"
            placeholder={t('register.namePlaceholder')}
            value={name}
            onChange={(e) => { e.target.setCustomValidity(''); setName(e.target.value); }}
            onInvalid={(e) => { (e.target as HTMLInputElement).setCustomValidity(t('validation.fieldRequired')); }}
            required
            className="h-11 bg-white/80 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-email" className="text-sm font-medium text-foreground/80">
            {t('register.email')}
          </Label>
          <Input
            id="reg-email"
            type="email"
            placeholder={t('register.emailPlaceholder')}
            value={email}
            onChange={(e) => { e.target.setCustomValidity(''); setEmail(e.target.value); }}
            onInvalid={(e) => {
              const el = e.target as HTMLInputElement;
              el.setCustomValidity(el.validity.valueMissing ? t('validation.emailRequired') : t('validation.emailInvalid'));
            }}
            required
            autoComplete="email"
            className="h-11 bg-white/80 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-password" className="text-sm font-medium text-foreground/80">
            {t('register.password')}
          </Label>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('register.passwordPlaceholder')}
              value={password}
              onChange={(e) => { e.target.setCustomValidity(''); setPassword(e.target.value); }}
              onInvalid={(e) => {
                const el = e.target as HTMLInputElement;
                el.setCustomValidity(el.validity.valueMissing ? t('validation.passwordRequired') : t('validation.passwordMinLength'));
              }}
              required
              minLength={6}
              autoComplete="new-password"
              className="h-11 bg-white/80 pr-10 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground/80">
            {t('register.confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => { e.target.setCustomValidity(''); setConfirmPassword(e.target.value); }}
              onInvalid={(e) => {
                const el = e.target as HTMLInputElement;
                el.setCustomValidity(el.validity.valueMissing ? t('validation.passwordRequired') : t('validation.passwordMinLength'));
              }}
              required
              minLength={6}
              autoComplete="new-password"
              className="h-11 bg-white/80 pr-10 text-base"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showConfirmPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="pt-1">
          <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
            {submitting ? (
              t('register.loading')
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('register.submit')}
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('register.login')}
          </Link>
        </p>
      </form>
    </div>
  );
}
