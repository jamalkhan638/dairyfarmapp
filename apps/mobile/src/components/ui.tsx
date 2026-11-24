import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { colors, font, space } from '../lib/theme';
import { daysAgo, formatDate, today } from '../lib/format';
import { SyncBar } from './SyncBar';

/** Standard page: sync bar on top, scrollable content. */
export function Screen({ children, scroll = true, footer }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={s.screen} edges={['bottom', 'left', 'right']}>
      <SyncBar />
      {scroll ? (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ title, onPress, variant = 'primary', disabled, busy, style }: { title: string; onPress: () => void; variant?: Variant; disabled?: boolean; busy?: boolean; style?: ViewStyle }) {
  const v = btn[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.button, v.box, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {busy ? <ActivityIndicator color={v.text.color} /> : <Text style={[s.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

const btn: Record<Variant, { box: ViewStyle; text: { color: string } }> = {
  primary: { box: { backgroundColor: colors.primary }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary }, text: { color: colors.primary } },
  danger: { box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger }, text: { color: colors.danger } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: colors.primary } },
};

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={colors.muted} style={[s.input, error ? { borderColor: colors.danger } : null, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/** Pick one option with big tappable chips (easier than dropdowns in the field). */
export function Choice<T extends string>({ label, value, options, onChange }: { label?: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.field}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && s.chipOn]} accessibilityState={{ selected: on }}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={s.toggleRow} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
      <View style={[s.box, value && s.boxOn]}>{value ? <Text style={s.tick}>✓</Text> : null}</View>
      <Text style={s.toggleText}>{label}</Text>
    </Pressable>
  );
}

/** Date with quick Today/Yesterday buttons and the Android calendar. */
export function DateField({ label, value, onChange, allowEmpty }: { label: string; value: string | null; onChange: (v: string | null) => void; allowEmpty?: boolean }) {
  const { t } = useTranslation();
  const open = () => {
    const base = value ? new Date(`${value}T12:00:00Z`) : new Date();
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      maximumDate: new Date(Date.now() + 366 * 86400_000),
      onChange: (e, d) => {
        if (e.type === 'set' && d) {
          const pk = new Date(d.getTime() + 5 * 3600_000);
          onChange(pk.toISOString().slice(0, 10));
        }
      },
    });
  };
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <View style={s.chips}>
        <Pressable onPress={open} style={[s.input, { flexGrow: 1, justifyContent: 'center' }]}>
          <Text style={{ fontSize: font.body, color: value ? colors.text : colors.muted }}>{value ? formatDate(value) : '—'}</Text>
        </Pressable>
      </View>
      <View style={[s.chips, { marginTop: space(2) }]}>
        <Pressable style={[s.chip, value === today() && s.chipOn]} onPress={() => onChange(today())}>
          <Text style={[s.chipText, value === today() && s.chipTextOn]}>{t('today')}</Text>
        </Pressable>
        <Pressable style={[s.chip, value === daysAgo(1) && s.chipOn]} onPress={() => onChange(daysAgo(1))}>
          <Text style={[s.chipText, value === daysAgo(1) && s.chipTextOn]}>{t('yesterday')}</Text>
        </Pressable>
        {allowEmpty && value ? (
          <Pressable style={s.chip} onPress={() => onChange(null)}>
            <Text style={s.chipText}>{t('none')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}
export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  const map = {
    neutral: [colors.bg, colors.muted],
    good: [colors.primaryLight, colors.primaryDark],
    warn: [colors.warnLight, colors.warn],
    bad: [colors.dangerLight, colors.danger],
    info: [colors.infoLight, colors.info],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: font.small, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'bad' }) {
  const bg = tone === 'info' ? colors.infoLight : tone === 'warn' ? colors.warnLight : colors.dangerLight;
  const fg = tone === 'info' ? colors.info : tone === 'warn' ? colors.warn : colors.danger;
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: font.body }}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(2) }, style]}>{children}</View>;
}

export function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={s.infoLine}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  footer: { padding: space(4), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  button: { minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(4) },
  buttonText: { fontSize: font.body, fontWeight: '700' },
  field: { gap: space(1) },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600', textAlign: 'left' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, paddingHorizontal: space(3), fontSize: font.body, color: colors.text, textAlign: 'left' },
  hint: { fontSize: font.small, color: colors.muted, textAlign: 'left' },
  error: { fontSize: font.small, color: colors.danger, textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { minHeight: 44, paddingHorizontal: space(4), borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.body, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 44 },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary },
  tick: { color: '#fff', fontWeight: '900' },
  toggleText: { fontSize: font.body, color: colors.text, flexShrink: 1, textAlign: 'left' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.border },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text, textAlign: 'left' },
  section: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: space(2), textAlign: 'left' },
  muted: { fontSize: font.small, color: colors.muted, textAlign: 'left' },
  body: { fontSize: font.body, color: colors.text, textAlign: 'left' },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  notice: { padding: space(3), borderRadius: 10 },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3), paddingVertical: space(1) },
  infoLabel: { fontSize: font.body, color: colors.muted },
  infoValue: { fontSize: font.body, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
