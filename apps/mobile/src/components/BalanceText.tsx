import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatPKR } from '../lib/format';
import { colors } from '../lib/theme';
import { Body, Muted } from './ui';

/** "Owes Rs 1,200" (red), "Paid in advance Rs 300" (green) or "Settled". */
export function BalanceText({ paisa }: { paisa: number }) {
  const { t } = useTranslation();
  if (paisa === 0) return <Muted>{t('settled')}</Muted>;
  return paisa > 0 ? (
    <Body style={{ color: colors.danger, fontWeight: '700' }}>{t('owes')} {formatPKR(paisa)}</Body>
  ) : (
    <Body style={{ color: colors.primaryDark, fontWeight: '700' }}>{t('advance')} {formatPKR(-paisa)}</Body>
  );
}


/** What the farm owes a supplier: "We owe Rs …" (red), advance (green) or "Settled". */
export function OwedText({ paisa }: { paisa: number }) {
  const { t } = useTranslation();
  if (paisa === 0) return <Muted>{t('settled')}</Muted>;
  return paisa > 0
    ? <Body style={{ color: colors.danger, fontWeight: '700' }}>{t('weOwe')} {formatPKR(paisa)}</Body>
    : <Body style={{ color: colors.primaryDark, fontWeight: '700' }}>{t('theyOwe')} {formatPKR(-paisa)}</Body>;
}

