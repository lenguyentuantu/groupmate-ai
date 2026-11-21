import type { EmailLocaleTexts } from '../types';

const INVITE_NEXT =
  'Mở lời mời để đăng nhập hoặc tạo tài khoản. Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email.';

export const en: EmailLocaleTexts = {
  linkHint: 'Hoặc mở liên kết này:',
  words: {
    someone: 'Một thành viên',
    untitled: 'Chưa có tên',
    owner: 'chủ sở hữu',
    manager: 'quản lý',
    member: 'thành viên',
  },
  templates: {
    reset: {
      subject: 'Reset your password',
      body: 'Use the link below to set a new password. Ignore this email if you did not ask for it.',
      button: 'Set a new password',
    },
    verify: {
      subject: 'Confirm your email address',
      body: 'Use the link below to confirm this address and finish signing up.',
      button: 'Confirm the address',
    },
    magic: {
      subject: 'Your sign-in link',
      body: 'Use the link below to sign in. It works once and expires shortly.',
      button: 'Sign in',
    },
    inviteProject: {
      subject: 'Bạn được mời tham gia dự án {project}',
      body: `{inviter} đã mời bạn tham gia dự án {project} với vai trò {role}.\n\n${INVITE_NEXT}`,
      button: 'Mở lời mời',
    },
    inviteTeam: {
      subject: 'Bạn được mời tham gia nhóm {team}',
      body: `{inviter} đã mời bạn tham gia nhóm {team} với vai trò {role}.\n\n${INVITE_NEXT}`,
      button: 'Mở lời mời',
    },
    assigned: {
      subject: '{ref}: assigned to you',
      body: '{actor} assigned this issue to you.\n\n{ref}: {title}',
      button: 'Open the issue',
    },
    mentioned: {
      subject: '{ref}: you were mentioned',
      body: '{actor} mentioned you on this issue.\n\n{ref}: {title}',
      button: 'Open the issue',
    },
    commented: {
      subject: '{ref}: new comment',
      body: '{actor} commented on this issue.\n\n{ref}: {title}',
      button: 'Open the comment',
    },
    stateChanged: {
      subject: '{ref}: status changed to {to}',
      body: '{actor} changed the status of this issue from {from} to {to}.\n\n{ref}: {title}',
      button: 'Open the issue',
    },
    documentMentioned: {
      subject: '{document}: you were mentioned',
      body: '{actor} mentioned you in this document.\n\n{document}',
      button: 'Open the document',
    },
    documentCommentMentioned: {
      subject: '{document}: you were mentioned',
      body: '{actor} mentioned you in a comment on this document.\n\n{document}',
      button: 'Open the document',
    },
    test: {
      subject: "It's a Plan email test",
      body: "If you can read this, email from It's a Plan works.",
      button: '',
    },
  },
};
