// components/rider/HelpScreen.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Image, Linking } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Phone, MessageCircle, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react-native';

const FAQS = [
  { q: "I can't see my job", a: "Make sure you are ONLINE on the Home tab. If you just accepted a job, tap the Active Job tab at the bottom." },
  { q: 'My map is not working', a: "Tap GET DIRECTIONS and it will open Google Maps automatically. Make sure you have an active data connection." },
  { q: 'How do I update my vehicle info?', a: "Go to your Profile tab at the bottom. You can update your vehicle type and plate number there and save." },
  { q: 'How do I log out?', a: "Go to your Profile tab and scroll to the bottom. You will see a Log Out button in red." },
  { q: 'I was assigned a job but missed it', a: "Do not worry. The job goes back to the pool automatically. Stay online and another assignment will come through soon." },
];

export default function HelpScreen() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });
  if (!fontsLoaded) return null;

  const callSupport = () => Linking.openURL('tel:+2348001234567');
  const whatsappSupport = () => Linking.openURL('https://wa.me/2348001234567?text=Hello%20RENAX%20Support%2C%20I%20need%20help.');

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.titleWrap}>
          <Text style={styles.screenTitle}>Need Help?</Text>
          <Text style={styles.screenSub}>We are here for you 24/7. Reach us in one tap.</Text>
        </Animated.View>

        {/* Support Buttons */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.supportRow}>
          <Pressable style={styles.callBtn} onPress={callSupport}>
            <View style={styles.supportIconWrap}>
              <Phone color="#002B22" size={24} strokeWidth={2} />
            </View>
            <Text style={styles.callBtnText}>Call Support</Text>
            <Text style={styles.callBtnSub}>One tap, direct line</Text>
          </Pressable>

          <Pressable style={styles.waBtn} onPress={whatsappSupport}>
            <View style={styles.supportIconWrapWa}>
              <MessageCircle color="#002B22" size={24} strokeWidth={2} />
            </View>
            <Text style={styles.waBtnText}>WhatsApp Us</Text>
            <Text style={styles.waBtnSub}>Chat with our team</Text>
          </Pressable>
        </Animated.View>

        {/* FAQs */}
        <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.faqWrap}>
          <View style={styles.faqTitleRow}>
            <HelpCircle color="#ccfd3a" size={18} strokeWidth={1.5} />
            <Text style={styles.faqTitle}>Common Questions</Text>
          </View>
          {FAQS.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <Pressable key={i} style={styles.faqItem} onPress={() => setOpenFaq(isOpen ? null : i)}>
                <View style={styles.faqRow}>
                  <Text style={styles.faqQ}>{faq.q}</Text>
                  {isOpen
                    ? <ChevronUp color="#ccfd3a" size={17} strokeWidth={2} />
                    : <ChevronDown color="rgba(200,255,220,0.35)" size={17} strokeWidth={2} />}
                </View>
                {isOpen && (
                  <Animated.View entering={FadeInDown.duration(300)}>
                    <Text style={styles.faqA}>{faq.a}</Text>
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        <Text style={styles.version}>RENAX Rider  ·  v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  logo: { width: 120, height: 42, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  titleWrap: { paddingHorizontal: 24, marginBottom: 24 },
  screenTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 30, color: '#fff', marginBottom: 6 },
  screenSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.45)', lineHeight: 22 },
  supportRow: { flexDirection: 'row', gap: 14, marginHorizontal: 24, marginBottom: 32 },
  callBtn: { flex: 1, backgroundColor: '#ccfd3a', borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 },
  waBtn: { flex: 1, backgroundColor: '#25D366', borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 },
  supportIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,43,34,0.15)', alignItems: 'center', justifyContent: 'center' },
  supportIconWrapWa: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,43,34,0.2)', alignItems: 'center', justifyContent: 'center' },
  callBtnText: { fontFamily: 'Outfit_7', fontSize: 15, color: '#002B22' },
  callBtnSub: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(0,43,34,0.6)', textAlign: 'center' },
  waBtnText: { fontFamily: 'Outfit_7', fontSize: 15, color: '#002B22' },
  waBtnSub: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(0,43,34,0.6)', textAlign: 'center' },
  faqWrap: { marginHorizontal: 24, gap: 4 },
  faqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  faqTitle: { fontFamily: 'PlusJakartaSans_6', fontSize: 18, color: '#fff' },
  faqItem: { backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 8 },
  faqRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  faqQ: { fontFamily: 'Outfit_6', fontSize: 15, color: '#fff', flex: 1, lineHeight: 22 },
  faqA: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.6)', marginTop: 12, lineHeight: 22 },
  version: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(255,255,255,0.18)', textAlign: 'center', marginTop: 32 },
});
