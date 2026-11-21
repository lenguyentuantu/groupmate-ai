import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeFromAcceptLanguage } from './accept-language';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locales';
import { loadMessages } from './messages';

// The app has no `[locale]` route segment, so every URL stays the same in every
// language. The account preference is the durable copy, the cookie selects later
// server renders. Login and signup default to Vietnamese when neither exists.
export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie)
    ? cookie
    : requestHeaders.get('x-auth-default-locale') === 'vi'
      ? DEFAULT_LOCALE
      : localeFromAcceptLanguage(requestHeaders.get('accept-language'));

  return {
    locale,
    messages: await loadMessages(locale),
    // The initial reference for relative times. Sharing it between the server and
    // client keeps hydration stable; RelativeTimeProvider advances it once mounted.
    now: new Date(),
  };
});
