// components/rider/ProfileScreen.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Image, TextInput } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { User, Bike, Hash, Phone, LogOut, Check, MapPin } from 'lucide-react-native';

const VEHICLE_TYPES = ['Motorcycle', 'Bicycle', 'Car', 'Tricycle (Keke)'];

export default function ProfileScreen({ rider, onLogout, onSaveProfile }) {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  const [name, setName] = useState(rider?.name || '');
  const [plate, setPlate] = useState(rider?.plate || 'LGA-123-XY');
  const [vehicle, setVehicle] = useState(rider?.vehicle || 'Motorcycle');
  const [state, setState] = useState(rider?.state || 'Lagos');
  const [city, setCity] = useState(rider?.city || 'Ikeja');
  const [saved, setSaved] = useState(false);

  if (!fontsLoaded) return null;

  const handleSave = () => {
    const terminalCode = state?.slice(0, 3)?.toUpperCase() || rider?.terminalCode || 'LOS';
    onSaveProfile?.({ name, plate, vehicle, state, city, terminalCode });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        {/* Avatar */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(name || 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.avatarName}>{name || 'Rider'}</Text>
          <View style={styles.riderBadge}>
            <Bike color="#ccfd3a" size={14} strokeWidth={1.8} />
            <Text style={styles.riderBadgeText}>RENAX RIDER</Text>
          </View>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.form}>
          {/* Name */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldIconWrap}><User color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor="#3a5c47"
              />
            </View>
          </View>

          {/* Phone (read-only) */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldIconWrap}><Phone color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <Text style={styles.fieldReadOnly}>+234 {rider?.phone || '801 234 5678'}</Text>
            </View>
          </View>

          {/* Plate */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldIconWrap}><Hash color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Plate Number</Text>
              <TextInput
                style={styles.fieldInput}
                value={plate}
                onChangeText={setPlate}
                placeholder="e.g. LGA-123-XY"
                placeholderTextColor="#3a5c47"
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldIconWrap}><MapPin color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Operating State</Text>
              <TextInput
                style={styles.fieldInput}
                value={state}
                onChangeText={setState}
                placeholder="Lagos"
                placeholderTextColor="#3a5c47"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldIconWrap}><MapPin color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Operating City</Text>
              <TextInput
                style={styles.fieldInput}
                value={city}
                onChangeText={setCity}
                placeholder="Ikeja"
                placeholderTextColor="#3a5c47"
              />
            </View>
          </View>

          {/* Vehicle Type */}
          <View style={styles.vehicleSection}>
            <View style={styles.fieldIconWrap}><Bike color="#ccfd3a" size={18} /></View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Vehicle Type</Text>
              <View style={styles.vehicleGrid}>
                {VEHICLE_TYPES.map(v => (
                  <Pressable
                    key={v}
                    style={[styles.vehicleChip, vehicle === v && styles.vehicleChipActive]}
                    onPress={() => setVehicle(v)}
                  >
                    {vehicle === v && <Check color="#002B22" size={14} />}
                    <Text style={[styles.vehicleChipText, vehicle === v && { color: '#002B22' }]}>{v}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Save Button */}
        <Animated.View entering={FadeInDown.duration(500).delay(350)} style={{ paddingHorizontal: 24, gap: 14 }}>
          <Pressable style={[styles.saveBtn, saved && { backgroundColor: '#10B981' }]} onPress={handleSave}>
            {saved ? <Check color="#002B22" size={22} /> : null}
            <Text style={styles.saveBtnText}>{saved ? 'Saved!' : 'SAVE CHANGES'}</Text>
          </Pressable>

          <Pressable style={styles.logoutBtn} onPress={onLogout}>
            <LogOut color="#EF4444" size={18} />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  logo: { width: 120, height: 42, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  avatarWrap: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#004d3d', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ccfd3a' },
  avatarText: { fontFamily: 'PlusJakartaSans_8', fontSize: 38, color: '#ccfd3a' },
  avatarName: { fontFamily: 'PlusJakartaSans_8', fontSize: 24, color: '#fff' },
  riderBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(204,253,58,0.1)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(204,253,58,0.25)' },
  riderBadgeText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#ccfd3a', letterSpacing: 1.5 },
  form: { marginHorizontal: 24, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 4, marginBottom: 20 },
  fieldGroup: { flexDirection: 'row', alignItems: 'flex-start', padding: 18, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fieldIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(204,253,58,0.1)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  fieldContent: { flex: 1, gap: 6 },
  fieldLabel: { fontFamily: 'Outfit_6', fontSize: 12, color: 'rgba(200,255,220,0.5)', letterSpacing: 1, textTransform: 'uppercase' },
  fieldInput: { fontFamily: 'Outfit_4', fontSize: 16, color: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 6 },
  fieldReadOnly: { fontFamily: 'Outfit_6', fontSize: 16, color: 'rgba(200,255,220,0.7)' },
  vehicleSection: { flexDirection: 'row', alignItems: 'flex-start', padding: 18, gap: 14 },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  vehicleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)' },
  vehicleChipActive: { backgroundColor: '#ccfd3a', borderColor: '#ccfd3a' },
  vehicleChipText: { fontFamily: 'Outfit_6', fontSize: 13, color: 'rgba(200,255,220,0.8)' },
  saveBtn: { backgroundColor: '#ccfd3a', borderRadius: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  saveBtnText: { fontFamily: 'Outfit_7', fontSize: 16, color: '#002B22', letterSpacing: 1 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.07)' },
  logoutBtnText: { fontFamily: 'Outfit_6', fontSize: 15, color: '#EF4444' },
});
