import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MonthReport } from '../domain/reports';
import { kg } from '../domain/feed';
import { Notice } from './ui';

/** Clear labels for anything that makes a month's figures incomplete or estimated. */
export function ReportWarnings({ r, skipCash }: { r: MonthReport; skipCash?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {r.warnings.map((w) => {
        if (skipCash && w === 'NO_OPENING_CASH') return null;
        const text =
          w === 'MILK_INCOMPLETE' ? t('w_MILK_INCOMPLETE', { recorded: r.milk.recorded, expected: r.milk.expected })
          : w === 'FEED_DAYS_MISSING' ? t('w_FEED_DAYS_MISSING_SIMPLE')
          : w === 'FEED_UNPRICED' ? t('w_FEED_UNPRICED', { kg: kg(r.feed.unpricedGrams) })
          : t(`w_${w}`);
        return <Notice key={w} tone={w === 'IN_PROGRESS' ? 'info' : 'warn'} text={text} />;
      })}
    </>
  );
}
