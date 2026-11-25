import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/session';
import { SyncProvider } from '../../lib/sync';
import { colors } from '../../lib/theme';

/** Everything behind login. Sync runs while any of these screens is open. */
export default function AppLayout() {
  const { t } = useTranslation();
  const { ready, me } = useSession();
  if (ready && !me) return <Redirect href="/login" />;
  return (
    <SyncProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="home" options={{ title: t('appName') }} />
        <Stack.Screen name="animals/index" options={{ title: t('animals') }} />
        <Stack.Screen name="animals/new" options={{ title: t('addAnimal') }} />
        <Stack.Screen name="animals/[id]/index" options={{ title: t('animal') }} />
        <Stack.Screen name="animals/[id]/edit" options={{ title: t('editAnimal') }} />
        <Stack.Screen name="animals/[id]/status" options={{ title: t('changeStatus') }} />
        <Stack.Screen name="milk/index" options={{ title: t('milk') }} />
        <Stack.Screen name="milk/entry" options={{ title: t('recordMilk') }} />
        <Stack.Screen name="milk/usage" options={{ title: t('addUsage') }} />
        <Stack.Screen name="milk/month" options={{ title: t('monthly') }} />
        <Stack.Screen name="sales/index" options={{ title: t('sales') }} />
        <Stack.Screen name="sales/round" options={{ title: t('deliveryRound') }} />
        <Stack.Screen name="sales/customer" options={{ title: t('addCustomer') }} />
        <Stack.Screen name="sales/[id]" options={{ title: t('customer') }} />
        <Stack.Screen name="sales/rate" options={{ title: t('changeRate') }} />
        <Stack.Screen name="sales/payment" options={{ title: t('receivePayment') }} />
        <Stack.Screen name="sales/delivery" options={{ title: t('editDelivery') }} />
        <Stack.Screen name="feed/index" options={{ title: t('feed') }} />
        <Stack.Screen name="feed/items" options={{ title: t('feedItems') }} />
        <Stack.Screen name="feed/item" options={{ title: t('addFeedItem') }} />
        <Stack.Screen name="feed/suppliers/index" options={{ title: t('suppliers') }} />
        <Stack.Screen name="feed/suppliers/[id]" options={{ title: t('supplier') }} />
        <Stack.Screen name="feed/supplier" options={{ title: t('addSupplier') }} />
        <Stack.Screen name="feed/purchase" options={{ title: t('addPurchase') }} />
        <Stack.Screen name="feed/supplier-payment" options={{ title: t('paySupplier') }} />
        <Stack.Screen name="feed/feeding" options={{ title: t('recordFeeding') }} />
        <Stack.Screen name="feed/log" options={{ title: t('feedingLog') }} />
        <Stack.Screen name="feed/stock-count" options={{ title: t('stockCount') }} />
        <Stack.Screen name="money/index" options={{ title: t('money') }} />
        <Stack.Screen name="money/expense" options={{ title: t('addExpense') }} />
        <Stack.Screen name="money/expenses" options={{ title: t('expenses') }} />
        <Stack.Screen name="money/capital" options={{ title: t('addCapital') }} />
        <Stack.Screen name="money/cashbook" options={{ title: t('cashBook') }} />
        <Stack.Screen name="money/opening" options={{ title: t('farmSettings') }} />
        <Stack.Screen name="health/index" options={{ title: t('health') }} />
        <Stack.Screen name="health/event" options={{ title: t('addHealth') }} />
        <Stack.Screen name="health/breeding" options={{ title: t('addBreeding') }} />
        <Stack.Screen name="health/reminder" options={{ title: t('addReminder') }} />
        <Stack.Screen name="reports/index" options={{ title: t('reports') }} />
        <Stack.Screen name="sync" options={{ title: t('syncDetails') }} />
        <Stack.Screen name="conflict/[id]" options={{ title: t('conflict') }} />
        <Stack.Screen name="history/[entity]/[id]" options={{ title: t('history') }} />
        <Stack.Screen name="settings/index" options={{ title: t('settings') }} />
        <Stack.Screen name="settings/users/index" options={{ title: t('users') }} />
        <Stack.Screen name="settings/users/[id]" options={{ title: t('editUser') }} />
      </Stack>
    </SyncProvider>
  );
}
