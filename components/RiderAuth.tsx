import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  Platform, Image, KeyboardAvoidingView, ScrollView, useWindowDimensions,
} from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Mail, Lock, User, Phone, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../supabase';
import { fetchTerminals } from '../utils/routingService';
import {
  deriveAccountRole,
  normalizeLogisticsRoles,
  RIDER_ACCOUNT_ROLE_OPTIONS,
  RIDER_LOGISTICS_ROLE_OPTIONS,
} from '../utils/logisticsRoles';

type RiderAuthProps = {
  onAuthenticated?: () => void;
  pendingDeliverEarnInviteToken?: string | null;
  authMessage?: string;
  onPendingDeliverEarnInviteCode?: (inviteCode: string | null) => void;
};

export default function RiderAuth({
  onAuthenticated,
  pendingDeliverEarnInviteToken,
  authMessage,
  onPendingDeliverEarnInviteCode,
}: RiderAuthProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deliverEarnInviteCode, setDeliverEarnInviteCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stateValue, setStateValue] = useState('Lagos');
  const [city, setCity] = useState('Ikeja');
  const [accountRole, setAccountRole] = useState<'driver' | 'rider'>('rider');
  const [logisticsRoles, setLogisticsRoles] = useState<string[]>(['rider']);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [preferredTerminalCode, setPreferredTerminalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadTerminals = async () => {
      const terminalRows = await fetchTerminals();
      setTerminals(terminalRows);
    };

    loadTerminals();
  }, []);

  const matchingTerminals = useMemo(
    () => terminals.filter((terminal) => terminal.state?.toLowerCase() === stateValue.trim().toLowerCase()),
    [stateValue, terminals],
  );

  if (!fontsLoaded) return null;

  const signIn = async () => {
    if (!email.trim() || !password) {
      setMessage('Enter your rider email and password.');
      return;
    }

    setLoading(true);
    setMessage('');
    onPendingDeliverEarnInviteCode?.(deliverEarnInviteCode.trim() || null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      onAuthenticated?.();
    } catch (error: any) {
      onPendingDeliverEarnInviteCode?.(null);
      setMessage(error?.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    if (!name.trim() || !email.trim() || !password || !phone.trim()) {
      setMessage('Complete all rider signup fields first.');
      return;
    }

    const normalizedRoles = normalizeLogisticsRoles(logisticsRoles, accountRole);
    if (!normalizedRoles.length) {
      setMessage('Select at least one logistics role for this staff account.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.trim();

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('Rider signup did not return a user account.');

      const resolvedPreferredTerminalCode =
        preferredTerminalCode
        || matchingTerminals[0]?.code
        || stateValue.trim().slice(0, 3).toUpperCase();

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email: trimmedEmail,
        role: deriveAccountRole(normalizedRoles, accountRole),
        full_name: name.trim(),
        phone_number: trimmedPhone,
        state: stateValue.trim() || 'Lagos',
        city: city.trim() || 'Ikeja',
        logistics_roles: normalizedRoles,
        preferred_terminal_code: resolvedPreferredTerminalCode,
      });

      if (profileError) throw profileError;

      setMessage('Rider account created. You are now signed in.');
      onAuthenticated?.();
    } catch (error: any) {
      setMessage(error?.message || 'Could not create rider account.');
    } finally {
      setLoading(false);
    }
  };

  const toggleLogisticsRole = (value: string) => {
    setLogisticsRoles((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#020f09' }}>
      <Image
        source={require('../assets/images/Sign in page background .png')}
        style={StyleSheet.absoluteFillObject as any}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(2,15,9,0.55)', 'rgba(2,15,9,0.88)', '#020f09']}
        style={StyleSheet.absoluteFillObject as any}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(900)} style={styles.logoWrap}>
            <Image
              source={require('../assets/images/logo.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.riderBadge}>
              <Text style={styles.riderBadgeText}>RIDER PORTAL</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={[styles.card, isCompact && styles.cardCompact]}>
            <View style={styles.tabRow}>
              <Pressable style={[styles.tab, mode === 'signin' && styles.tabActive]} onPress={() => setMode('signin')}>
                <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text>
              </Pressable>
              <Pressable style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}>
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create Rider</Text>
              </Pressable>
            </View>

            {mode === 'signin' ? (
              <>
                <Mail color="#ccfd3a" size={36} style={{ marginBottom: 16 }} />
                <Text style={styles.cardTitle}>Rider Sign In</Text>
                <Text style={styles.cardSub}>
                  {pendingDeliverEarnInviteToken
                    ? 'Sign in with the same RENAX account approved for Deliver & Earn. This invite opens the Rider app in Deliver & Earn mode only.'
                    : 'Use your rider email and password. Phone OTP will come later when SMS auth is connected.'}
                </Text>

                <View style={styles.inputWrap}>
                  <Mail color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="rider@renax.ng"
                    placeholderTextColor="#3a5c47"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Lock color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#3a5c47"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                {!pendingDeliverEarnInviteToken ? (
                  <View style={styles.inputWrap}>
                    <ShieldCheck color="#6B7280" size={16} />
                    <TextInput
                      style={styles.input}
                      placeholder="Deliver & Earn invite code, if issued"
                      placeholderTextColor="#3a5c47"
                      autoCapitalize="characters"
                      value={deliverEarnInviteCode}
                      onChangeText={setDeliverEarnInviteCode}
                    />
                  </View>
                ) : null}

                <Pressable
                  style={[styles.bigBtn, loading && { opacity: 0.6 }]}
                  onPress={signIn}
                  disabled={loading}
                >
                  <Text style={styles.bigBtnText}>{loading ? 'Signing in...' : 'SIGN IN'}</Text>
                  <ArrowRight color="#002B22" size={22} />
                </Pressable>
              </>
            ) : (
              <>
                <User color="#ccfd3a" size={36} style={{ marginBottom: 16 }} />
                <Text style={styles.cardTitle}>Create Logistics Staff Account</Text>
                <Text style={styles.cardSub}>This creates RENAX staff rider/driver access. Deliver & Earn applicants should sign in with their approved RENAX customer account and invite instead.</Text>

                <View style={styles.inputWrap}>
                  <User color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="Rider name"
                    placeholderTextColor="#3a5c47"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Mail color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="rider@renax.ng"
                    placeholderTextColor="#3a5c47"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Phone color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="08012345678"
                    placeholderTextColor="#3a5c47"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <View style={styles.dualRow}>
                  <View style={[styles.inputWrap, styles.half]}>
                    <TextInput
                      style={styles.input}
                      placeholder="State"
                      placeholderTextColor="#3a5c47"
                      value={stateValue}
                      onChangeText={setStateValue}
                    />
                  </View>
                  <View style={[styles.inputWrap, styles.half]}>
                    <TextInput
                      style={styles.input}
                      placeholder="City"
                      placeholderTextColor="#3a5c47"
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                </View>

                <View style={styles.roleSection}>
                  <Text style={styles.roleSectionLabel}>Preferred Hub</Text>
                  <Text style={styles.roleSectionSub}>
                    Choose the terminal this staff account should stay linked to by default. Ops can still assign a different live hub later.
                  </Text>
                  <View style={styles.roleChipRow}>
                    {(matchingTerminals.length > 0 ? matchingTerminals : terminals.slice(0, 6)).map((terminal) => {
                      const active = preferredTerminalCode === terminal.code;
                      return (
                        <Pressable
                          key={terminal.id}
                          style={[styles.roleChip, active && styles.roleChipActive]}
                          onPress={() => setPreferredTerminalCode(terminal.code)}
                        >
                          <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                            {terminal.code} • {terminal.city}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.helperCopy}>
                    {preferredTerminalCode
                      ? `Selected hub: ${preferredTerminalCode}`
                      : matchingTerminals[0]?.code
                        ? `Recommended hub: ${matchingTerminals[0].code}`
                        : 'Set a state first to see the nearest terminal options.'}
                  </Text>
                </View>

                <View style={styles.roleSection}>
                  <Text style={styles.sectionLabel}>Account Role</Text>
                  <View style={styles.choiceRow}>
                    {RIDER_ACCOUNT_ROLE_OPTIONS.map((option) => {
                      const active = accountRole === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[styles.choiceChip, active && styles.choiceChipActive]}
                          onPress={() => setAccountRole(option.value)}
                        >
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.roleSection}>
                  <Text style={styles.sectionLabel}>Logistics Roles</Text>
                  <View style={styles.roleGrid}>
                    {RIDER_LOGISTICS_ROLE_OPTIONS.map((option) => {
                      const active = logisticsRoles.includes(option.value);
                      return (
                        <Pressable
                          key={option.value}
                          style={[styles.roleCard, active && styles.roleCardActive]}
                          onPress={() => toggleLogisticsRole(option.value)}
                        >
                          <Text style={[styles.roleCardTitle, active && styles.roleCardTitleActive]}>{option.label}</Text>
                          <Text style={[styles.roleCardSub, active && styles.roleCardSubActive]}>{option.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Lock color="#6B7280" size={16} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#3a5c47"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                <Pressable
                  style={[styles.bigBtn, loading && { opacity: 0.6 }]}
                  onPress={signUp}
                  disabled={loading}
                >
                  <Text style={styles.bigBtnText}>{loading ? 'Creating...' : 'CREATE RIDER ACCOUNT'}</Text>
                  <ArrowRight color="#002B22" size={22} />
                </Pressable>
              </>
            )}

            {authMessage ? <Text style={styles.message}>{authMessage}</Text> : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(500)} style={styles.trust}>
            <Text style={styles.trustText}>Secure rider auth now uses Supabase sessions. Phone OTP login can come back once SMS is connected.</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 28,
  },
  logoWrap: {
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 220,
    height: 76,
    ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}),
  },
  riderBadge: {
    backgroundColor: 'rgba(204,253,58,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204,253,58,0.3)',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  riderBadgeText: {
    fontFamily: 'Outfit_7',
    fontSize: 13,
    color: '#ccfd3a',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(4,20,13,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 32,
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)' } : {}),
  },
  cardCompact: {
    padding: 22,
    borderRadius: 18,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: '#ccfd3a',
  },
  tabText: {
    fontFamily: 'Outfit_6',
    color: 'rgba(255,255,255,0.7)',
  },
  tabTextActive: {
    color: '#002B22',
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_8',
    fontSize: 26,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  cardSub: {
    fontFamily: 'Outfit_4',
    fontSize: 15,
    color: 'rgba(200,255,220,0.65)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontFamily: 'Outfit_4',
    fontSize: 16,
    paddingVertical: 14,
  },
  dualRow: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  roleSection: {
    gap: 10,
    marginBottom: 14,
  },
  roleSectionLabel: {
    fontFamily: 'Outfit_6',
    fontSize: 12,
    color: '#9FC9B3',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  roleSectionSub: {
    fontFamily: 'Outfit_4',
    fontSize: 12,
    color: '#8bb39f',
    lineHeight: 18,
  },
  roleChipRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(204,253,58,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  roleChipActive: {
    backgroundColor: '#ccfd3a',
    borderColor: '#ccfd3a',
  },
  roleChipText: {
    fontFamily: 'Outfit_6',
    fontSize: 13,
    color: '#d7eadd',
  },
  roleChipTextActive: {
    color: '#002B22',
  },
  helperCopy: {
    fontFamily: 'Outfit_4',
    fontSize: 12,
    color: 'rgba(200,255,220,0.56)',
    lineHeight: 18,
  },
  sectionLabel: {
    fontFamily: 'Outfit_6',
    fontSize: 12,
    color: '#9FC9B3',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(204,253,58,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  choiceChipActive: {
    backgroundColor: '#ccfd3a',
    borderColor: '#ccfd3a',
  },
  choiceChipText: {
    fontFamily: 'Outfit_6',
    fontSize: 13,
    color: '#d7eadd',
  },
  choiceChipTextActive: {
    color: '#002B22',
  },
  roleGrid: {
    gap: 10,
  },
  roleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(204,253,58,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    gap: 4,
  },
  roleCardActive: {
    backgroundColor: 'rgba(204,253,58,0.15)',
    borderColor: '#ccfd3a',
  },
  roleCardTitle: {
    fontFamily: 'PlusJakartaSans_6',
    fontSize: 14,
    color: '#fff',
  },
  roleCardTitleActive: {
    color: '#ecffd0',
  },
  roleCardSub: {
    fontFamily: 'Outfit_4',
    fontSize: 12,
    color: '#8bb39f',
    lineHeight: 18,
  },
  roleCardSubActive: {
    color: '#d5efdd',
  },
  bigBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ccfd3a',
    paddingVertical: 18,
    borderRadius: 14,
  },
  bigBtnText: {
    fontFamily: 'PlusJakartaSans_6',
    fontSize: 15,
    color: '#002B22',
    letterSpacing: 1,
  },
  message: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: 'Outfit_6',
    fontSize: 13,
    color: '#FCD34D',
    lineHeight: 20,
  },
  trust: {
    alignItems: 'center',
    maxWidth: 420,
  },
  trustText: {
    fontFamily: 'Outfit_4',
    fontSize: 12,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
