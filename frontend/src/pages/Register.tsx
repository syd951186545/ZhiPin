import React, {type FormEvent, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {motion} from 'motion/react';
import {UserPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {useAuth} from '@/contexts/AuthContext';
import {useI18n} from '@/contexts/I18nContext';

export default function Register() {
  const { register, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'));
      return;
    }

    try {
      await register(email, password, name, companyName);
      navigate('/');
    } catch {
      setError(t('register.error'));
    }
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full"
      >
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Workspace Setup</p>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">{t('register.title')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('register.desc')}</p>
        </div>

        <Card className="overflow-hidden border-white/70 bg-[rgba(255,253,250,0.96)] shadow-[0_18px_42px_-28px_rgba(20,32,43,0.16)]">
          <div className="h-1 bg-[linear-gradient(90deg,#155E63_0%,#155E63_38%,#D89B2B_38%,#D89B2B_64%,transparent_64%)]" />
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-5">
              {error && (
                <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('register.companyName')}</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder={t('register.companyNamePlaceholder')}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('register.name')}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={t('register.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('register.email')}</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder={t('register.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('register.password')}</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder={t('register.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('register.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t('register.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-1">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>{t('register.loading')}</>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t('register.submit')}
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {t('register.hasAccount')}{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  {t('register.login')}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
