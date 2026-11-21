'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuthConfig } from '@/services/authConfig.service';
import AuthFormHeader from '../AuthFormHeader';
import AuthMessagePanel from '../AuthMessagePanel';
import { AuthError, safeAuthReturnTo, setNewPassword } from '../../services/auth.service';
import { useAuthAction } from '../../hooks/useAuthAction';

const DEAD_LINK_CODES = new Set(['INVALID_TOKEN', 'USER_NOT_FOUND']);

// The screen the reset link opens. better-auth redirects here with ?token= when the
// token is valid, and with ?error= when it expired or was already used.
export default function AuthResetPasswordForm() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const returnTo = safeAuthReturnTo(params.get('returnTo'));
  const linkError = params.get('error');
  // The api refuses /reset-password while the password form is off, so a link issued
  // before it was turned off must not offer a password field.
  const passwordEnabled = useAuthConfig()?.emailPassword !== false;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // The link was used, expired or names an account that is gone: the same dead-link
  // screen as a link that arrives broken.
  const [linkDead, setLinkDead] = useState(false);
  const { error, pending, setError, run } = useAuthAction();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError(t('errors.passwordsDoNotMatch'));
      return;
    }
    run(
      async () => {
        try {
          const { signedIn } = await setNewPassword({ token, email, newPassword: password });
          const loginParams = new URLSearchParams({ reset: '1' });
          if (returnTo) loginParams.set('returnTo', returnTo);
          const destination = signedIn ? (returnTo ?? '/') : `/login?${loginParams.toString()}`;
          router.push(destination);
          router.refresh();
        } catch (err) {
          if (err instanceof AuthError && DEAD_LINK_CODES.has(err.code ?? '')) {
            setLinkDead(true);
            return;
          }
          throw err;
        }
      },
      { redirect: false },
    );
  }

  if (!passwordEnabled) {
    return (
      <AuthMessagePanel
        title={t('resetPassword.deadLinkTitle')}
        description={t('errors.passwordDisabled')}
        footer={
          <Link href="/login" className="underline underline-offset-4">
            {t('forgotPassword.backToSignIn')}
          </Link>
        }
      />
    );
  }

  if (!token || linkError || linkDead) {
    return (
      <AuthMessagePanel
        title={t('resetPassword.deadLinkTitle')}
        description={t('resetPassword.deadLinkDescription')}
        footer={
          <Link
            href={
              returnTo
                ? `/forgot-password?returnTo=${encodeURIComponent(returnTo)}`
                : '/forgot-password'
            }
            className="underline underline-offset-4"
          >
            {t('resetPassword.sendNewLink')}
          </Link>
        }
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="p-6 md:p-8">
      <FieldGroup>
        <AuthFormHeader
          title={t('resetPassword.title')}
          description={t('resetPassword.subtitle')}
        />

        <Field>
          <FieldLabel htmlFor="password">{t('fields.newPassword')}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
          <FieldDescription>{t('fields.passwordHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">{t('fields.confirmPassword')}</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={pending}
          />
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? t('resetPassword.submitPending') : t('resetPassword.submit')}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
