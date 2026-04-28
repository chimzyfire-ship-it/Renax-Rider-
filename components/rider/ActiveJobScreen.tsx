// components/rider/ActiveJobScreen.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Image, Linking } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Navigation, CheckCircle2, Package, MapPin, Inbox } from 'lucide-react-native';
import { supabase } from '../../supabase';
import { publishLocation } from '../../utils/locationPublisher';
import { logShipmentEvent, stageLabel } from '../../utils/routingService';

export default function ActiveJobScreen({ job, rider, onJobComplete }) {
  const [phase, setPhase] = useState<'pickup' | 'deliver' | 'done'>('pickup');
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  if (!fontsLoaded) return null;

  const isRelayToSourceTerminal = job?.routing_mode === 'relay_terminal' && job?.dispatch_stage === 'awaiting_source_terminal';
  const isFinalMileRelay = job?.routing_mode === 'relay_terminal' && (job?.dispatch_stage === 'out_for_delivery' || job?.dispatch_stage === 'awaiting_final_mile_rider');

  if (!job) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 36 }]}>
        <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
        <View style={styles.emptyIconWrap}>
          <Inbox color="rgba(204,253,58,0.5)" size={52} strokeWidth={1} />
        </View>
        <Text style={styles.noJobTitle}>No Active Job</Text>
        <Text style={styles.noJobSub}>Go online on the Home tab to start receiving delivery jobs from dispatch.</Text>
      </View>
    );
  }

  const openMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps://?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });
    Linking.openURL(url);
  };

  const completeCurrentPhase = async () => {
    if (!job) return;

    if (phase === 'pickup') {
      if (isRelayToSourceTerminal) {
        await supabase
          .from('shipments')
          .update({
            dispatch_stage: 'received_at_source_terminal',
            status: 'At Source Hub',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        await logShipmentEvent(job.id, 'received_at_source_terminal', rider?.state || 'Terminal', rider?.id, 'rider', 'Rider handed shipment to source terminal staff.');
        setPhase('done');
        setTimeout(onJobComplete, 1800);
        return;
      }

      await supabase
        .from('shipments')
        .update({
          status: 'In Transit',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      await logShipmentEvent(job.id, 'out_for_delivery', rider?.state || 'Route', rider?.id, 'rider', 'Rider confirmed pickup and started transit.');
      setPhase('deliver');
      return;
    }

    await supabase
      .from('shipments')
      .update({
        dispatch_stage: 'delivered',
        status: 'Delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    await logShipmentEvent(job.id, 'delivered', job.delivery_address || rider?.state || 'Destination', rider?.id, 'rider', isFinalMileRelay ? 'Final-mile relay delivery completed.' : 'Local delivery completed.');
    setPhase('done');
    try {
      if (rider?.id) {
        const pos = await (await import('expo-location')).getCurrentPositionAsync({ accuracy: (await import('expo-location')).Accuracy.Balanced });
        await publishLocation(rider.id, {
          lat: pos?.coords?.latitude ?? 0,
          lng: pos?.coords?.longitude ?? 0,
          is_online: true,
          current_shipment_id: null,
        });
      }
    } catch (e) {
      // ignore
    }
    setTimeout(onJobComplete, 2500);
  };

  if (phase === 'done') {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 36 }]}>
        <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
        <Animated.View entering={FadeInDown.duration(600)} style={{ alignItems: 'center', gap: 18 }}>
          <View style={styles.doneIconWrap}>
            <CheckCircle2 color="#ccfd3a" size={52} strokeWidth={1.5} />
          </View>
          <Text style={styles.doneTitle}>Job Complete</Text>
          <Text style={styles.doneSub}>You have successfully delivered order {job.id}. Returning to history...</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
          <View style={styles.jobIdBadge}>
            <Text style={styles.jobIdText}>#{job.id}</Text>
          </View>
        </Animated.View>

        {/* Progress Steps */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.progressRow}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, styles.stepDotDone]}>
              <CheckCircle2 color="#002B22" size={14} strokeWidth={2.5} />
            </View>
            <Text style={styles.stepLabel}>Assigned</Text>
          </View>
          <View style={[styles.stepLine, phase !== 'pickup' && styles.stepLineDone]} />
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, phase !== 'pickup' ? styles.stepDotDone : styles.stepDotActive]}>
              {phase !== 'pickup'
                ? <CheckCircle2 color="#002B22" size={14} strokeWidth={2.5} />
                : <Text style={styles.stepDotNum}>2</Text>}
            </View>
            <Text style={styles.stepLabel}>Picked Up</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, styles.stepDotInactive]}>
              <Text style={[styles.stepDotNum, { color: 'rgba(255,255,255,0.3)' }]}>3</Text>
            </View>
            <Text style={styles.stepLabel}>Delivered</Text>
          </View>
        </Animated.View>

        {/* Phase Card */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.phaseCard}>
          <View style={styles.phaseIconWrap}>
            <MapPin color="#ccfd3a" size={32} strokeWidth={1.5} />
          </View>
          <Text style={styles.phaseTitle}>
            {phase === 'pickup'
              ? (isRelayToSourceTerminal ? 'Take the package to the source terminal' : 'Go pick up the package')
              : 'Deliver the package'}
          </Text>
          <Text style={styles.phaseHint}>{stageLabel(job.dispatch_stage || 'awaiting_rider_acceptance')}</Text>

          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>{phase === 'pickup' ? (isRelayToSourceTerminal ? 'SOURCE TERMINAL DROP-OFF' : 'PICKUP ADDRESS') : 'DELIVERY ADDRESS'}</Text>
            <Text style={styles.addressValue}>
              {phase === 'pickup'
                ? (isRelayToSourceTerminal ? (job.source_terminal_address || `${job.pickup_state} terminal`) : (job.pickup_address || job.pickup))
                : (job.delivery_address || job.dropoff)}
            </Text>
          </View>

          <Pressable
            style={styles.directionsBtn}
            onPress={() => openMaps(
              phase === 'pickup'
                ? (isRelayToSourceTerminal ? (job.source_terminal_address || `${job.pickup_state} terminal`) : (job.pickup_address || job.pickup))
                : (job.delivery_address || job.dropoff)
            )}
          >
            <Navigation color="#002B22" size={19} strokeWidth={2} />
            <Text style={styles.directionsBtnText}>GET DIRECTIONS</Text>
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.packageRow}>
            <Package color="#ccfd3a" size={16} strokeWidth={1.5} />
            <Text style={styles.packageText}>{job.packageType}  ·  {job.distance}</Text>
          </View>
        </Animated.View>

        {/* Confirm Button */}
        <Animated.View entering={FadeInDown.duration(600).delay(350)} style={{ paddingHorizontal: 24 }}>
          {phase === 'pickup' ? (
            <Pressable style={styles.confirmBtn} onPress={completeCurrentPhase}>
              <CheckCircle2 color="#002B22" size={22} strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>{isRelayToSourceTerminal ? 'HANDED TO SOURCE HUB' : 'I HAVE PICKED IT UP'}</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.confirmBtn, { backgroundColor: '#10B981' }]} onPress={completeCurrentPhase}>
              <CheckCircle2 color="#002B22" size={22} strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>I HAVE DELIVERED IT</Text>
            </Pressable>
          )}
          <Text style={styles.confirmHint}>
            {phase === 'pickup'
              ? (isRelayToSourceTerminal ? 'Only tap this after terminal staff receives the package.' : 'Only tap this after the package is in your hands.')
              : 'Only tap this after handing the package to the recipient.'}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 20 },
  logo: { width: 120, height: 42, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  jobIdBadge: { backgroundColor: 'rgba(204,253,58,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(204,253,58,0.25)' },
  jobIdText: { fontFamily: 'Outfit_7', fontSize: 13, color: '#ccfd3a', letterSpacing: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 28 },
  stepItem: { alignItems: 'center', gap: 6 },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#ccfd3a' },
  stepDotActive: { backgroundColor: '#10B981' },
  stepDotInactive: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  stepDotNum: { fontFamily: 'Outfit_7', fontSize: 13, color: '#002B22' },
  stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 20 },
  stepLineDone: { backgroundColor: '#ccfd3a' },
  stepLabel: { fontFamily: 'Outfit_4', fontSize: 10, color: 'rgba(200,255,220,0.45)', letterSpacing: 0.5 },
  phaseCard: { marginHorizontal: 24, backgroundColor: 'rgba(4,25,16,0.9)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 28, alignItems: 'center', gap: 16, marginBottom: 24 },
  phaseIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(204,253,58,0.1)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.2)', alignItems: 'center', justifyContent: 'center' },
  phaseTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 22, color: '#fff', textAlign: 'center' },
  phaseHint: { fontFamily: 'Outfit_6', fontSize: 12, color: '#ccfd3a', letterSpacing: 1 },
  addressBox: { width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  addressLabel: { fontFamily: 'Outfit_6', fontSize: 10, color: 'rgba(200,255,220,0.45)', letterSpacing: 1.5, marginBottom: 8 },
  addressValue: { fontFamily: 'PlusJakartaSans_6', fontSize: 15, color: '#fff', lineHeight: 24 },
  directionsBtn: { width: '100%', backgroundColor: '#ccfd3a', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  directionsBtnText: { fontFamily: 'Outfit_7', fontSize: 15, color: '#002B22', letterSpacing: 1 },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  packageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  packageText: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.6)' },
  confirmBtn: { backgroundColor: '#F59E0B', borderRadius: 18, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 },
  confirmBtnText: { fontFamily: 'Outfit_7', fontSize: 17, color: '#002B22', letterSpacing: 1 },
  confirmHint: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.38)', textAlign: 'center', lineHeight: 20 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(204,253,58,0.07)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.15)', alignItems: 'center', justifyContent: 'center' },
  noJobTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 26, color: '#fff', textAlign: 'center' },
  noJobSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.45)', textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  doneIconWrap: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(204,253,58,0.08)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.2)', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 32, color: '#ccfd3a', textAlign: 'center' },
  doneSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.55)', textAlign: 'center', lineHeight: 24 },
});
