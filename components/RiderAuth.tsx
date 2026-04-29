// RiderAuth.tsx — Phone OTP Login, exact RENAX brand style
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  Platform, Image, KeyboardAvoidingView, ScrollView, useWindowDimensions,
} from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Phone, ShieldCheck, Lock } from 'lucide-react-native';

export default function RiderAuth({ onAuthenticated }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  if (!fontsLoaded) return null;

  const sendOtp = () => {
    if (phone.length < 7) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep('otp'); }, 1200);
  };

  const verifyOtp = () => {
    if (otp.length < 4) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onAuthenticated({
        id: phone || 'demo-rider',
        name: 'Rider',
        phone,
        state: 'Lagos',
        city: 'Ikeja',
        terminalCode: 'LOS',
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    }, 1000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#020f09' }}>
      {/* Background image */}
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
          {/* Logo */}
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

          {/* Card */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={[styles.card, isCompact && styles.cardCompact]}>

            {step === 'phone' ? (
              <>
                <Phone color="#ccfd3a" size={36} style={{ marginBottom: 16 }} />
                <Text style={styles.cardTitle}>Enter Your Phone Number</Text>
                <Text style={styles.cardSub}>We&apos;ll send a 6-digit code to verify it&apos;s you. No passwords needed.</Text>

                {/* Phone Input */}
                <View style={styles.phoneRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+234</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="801 234 5678"
                    placeholderTextColor="#3a5c47"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={11}
                  />
                </View>

                <Pressable
                  style={[styles.bigBtn, (!phone || phone.length < 7) && { opacity: 0.45 }]}
                  onPress={sendOtp}
                  disabled={loading || phone.length < 7}
                >
                  <Text style={styles.bigBtnText}>{loading ? 'Sending...' : 'SEND CODE'}</Text>
                  <ArrowRight color="#002B22" size={22} />
                </Pressable>
              </>
            ) : (
              <>
                <ShieldCheck color="#ccfd3a" size={36} style={{ marginBottom: 16 }} />
                <Text style={styles.cardTitle}>Enter the 6-Digit Code</Text>
                <Text style={styles.cardSub}>We sent a verification code to{'\n'}
                  <Text style={{ color: '#ccfd3a' }}>+234 {phone}</Text>
                </Text>

                <TextInput
                  style={styles.otpInput}
                  placeholder="------"
                  placeholderTextColor="#3a5c47"
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={setOtp}
                  maxLength={6}
                  textAlign="center"
                />

                <Pressable
                  style={[styles.bigBtn, otp.length < 4 && { opacity: 0.45 }]}
                  onPress={verifyOtp}
                  disabled={loading || otp.length < 4}
                >
                  <Text style={styles.bigBtnText}>{loading ? 'Verifying...' : 'VERIFY & LOG IN'}</Text>
                  <ArrowRight color="#002B22" size={22} />
                </Pressable>

                <Pressable onPress={() => setStep('phone')} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={styles.backText}>← Change phone number</Text>
                </Pressable>
              </>
            )}
          </Animated.View>

          {/* Footer trust */}
          <Animated.View entering={FadeInDown.duration(600).delay(500)} style={styles.trust}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Lock color="rgba(255,255,255,0.25)" size={12} strokeWidth={2} />
            <Text style={styles.trustText}>Secure · Verified · RENAX Logistics v1.0</Text>
          </View>
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
    maxWidth: 420,
    backgroundColor: 'rgba(4,20,13,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 36,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)' } : {}),
  },
  cardCompact: {
    padding: 22,
    borderRadius: 18,
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
    marginBottom: 28,
  },
  phoneRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  countryCode: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontFamily: 'Outfit_6',
    fontSize: 15,
    color: '#fff',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: '#fff',
    fontFamily: 'Outfit_4',
    fontSize: 18,
    letterSpacing: 2,
  },
  otpInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(204,253,58,0.3)',
    borderRadius: 16,
    paddingVertical: 20,
    color: '#ccfd3a',
    fontFamily: 'PlusJakartaSans_8',
    fontSize: 36,
    letterSpacing: 12,
    marginBottom: 20,
  },
  bigBtn: {
    width: '100%',
    backgroundColor: '#ccfd3a',
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bigBtnText: {
    fontFamily: 'Outfit_7',
    fontSize: 17,
    color: '#002B22',
    letterSpacing: 1,
  },
  backText: {
    fontFamily: 'Outfit_4',
    fontSize: 14,
    color: 'rgba(200,255,220,0.45)',
    textDecorationLine: 'underline',
  },
  trust: {
    alignItems: 'center',
  },
  trustText: {
    fontFamily: 'Outfit_4',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.5,
  },
});
