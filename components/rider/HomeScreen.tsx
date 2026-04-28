// components/rider/HomeScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Platform,
  ScrollView, Modal, Vibration, ActivityIndicator,
} from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeInDown, useSharedValue, withRepeat,
  withTiming, withSpring, useAnimatedStyle, Easing,
} from 'react-native-reanimated';
import {
  Package, Clock, CheckCircle2, XCircle, Bell,
  Wifi, WifiOff, MapPin, Radio,
} from 'lucide-react-native';
import { supabase } from '../../supabase';
import { publishLocation, startLocationUpdates, stopLocationUpdates } from '../../utils/locationPublisher';
import { logShipmentEvent, stageLabel } from '../../utils/routingService';

const PulseRing = ({ isOnline }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (isOnline) {
      scale.value = withRepeat(withTiming(1.6, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false);
      opacity.value = withRepeat(withTiming(0, { duration: 1600 }), -1, false);
    } else {
      scale.value = withSpring(1);
      opacity.value = withSpring(0);
    }
    // Reanimated shared values are intentionally mutated inside this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={[
      StyleSheet.absoluteFillObject,
      { borderRadius: 999, backgroundColor: isOnline ? 'rgba(16,185,129,0.3)' : 'transparent' },
      anim,
    ]} />
  );
};

type LiveJob = {
  id: string;
  tracking_id: string;
  pickup_address: string;
  delivery_address: string;
  package_category: string;
  distance_km: number | null;
  estimated_price: number;
  service_level: string;
  routing_mode?: string | null;
  dispatch_stage?: string | null;
  pickup_state?: string | null;
  delivery_state?: string | null;
  source_terminal_id?: string | null;
  destination_terminal_id?: string | null;
  is_agro_shipment?: boolean | null;
  agro_produce_category?: string | null;
  agro_handling_notes?: string | null;
  requires_cold_chain?: boolean | null;
};

export default function HomeScreen({ rider, onAcceptJob }) {
  const [isOnline, setIsOnline] = useState(false);
  const [showJobAlert, setShowJobAlert] = useState(false);
  const [jobTimer, setJobTimer] = useState(60);
  const [currentJob, setCurrentJob] = useState<LiveJob | null>(null);
  const riderState = rider?.state || 'Lagos';
  const timerRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  // ── Live stats from Supabase ──────────────────────────────────────────────
  const [activeJobs, setActiveJobs] = useState<number | null>(null);
  const [completedJobs, setCompletedJobs] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const [{ count: active }, { count: completed }] = await Promise.all([
          supabase
            .from('shipments')
            .select('*', { count: 'exact', head: true })
            .or(`pickup_state.eq.${riderState},delivery_state.eq.${riderState}`)
            .in('dispatch_stage', ['awaiting_rider_acceptance', 'awaiting_source_terminal', 'awaiting_final_mile_rider', 'out_for_delivery']),
          supabase
            .from('shipments')
            .select('*', { count: 'exact', head: true })
            .or(`assigned_rider_id.eq.${rider?.id || '00000000-0000-0000-0000-000000000000'},final_mile_rider_id.eq.${rider?.id || '00000000-0000-0000-0000-000000000000'}`)
            .eq('dispatch_stage', 'delivered'),
        ]);
        setActiveJobs(active ?? 0);
        setCompletedJobs(completed ?? 0);
      } catch {
        setActiveJobs(0); setCompletedJobs(0);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [rider?.id, riderState]);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  // ── Subscribe to new jobs when rider goes online ──────────────────────────
  useEffect(() => {
    let sub: any = null;
    if (isOnline) {
      channelRef.current = supabase
        .channel(`new-rider-jobs-${riderState}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'shipments',
          filter: "dispatch_stage=eq.awaiting_rider_acceptance",
        }, (payload: any) => {
          const job = (payload.new || payload.record) as LiveJob;
          if (!job) return;
          const isRelayFinalMile = job.dispatch_stage === 'awaiting_final_mile_rider' && job.delivery_state === riderState;
          const isEligibleAwaitingAccept = job.dispatch_stage === 'awaiting_rider_acceptance' && job.pickup_state === riderState;
          if (!isRelayFinalMile && !isEligibleAwaitingAccept) return;
          setCurrentJob(job);
          setShowJobAlert(true);
          setJobTimer(60);
          if (Platform.OS !== 'web') Vibration.vibrate([500, 300, 500, 300, 500]);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'shipments',
          filter: "dispatch_stage=eq.awaiting_final_mile_rider",
        }, (payload: any) => {
          const job = (payload.new || payload.record) as LiveJob;
          if (!job || job.delivery_state !== riderState) return;
          setCurrentJob(job);
          setShowJobAlert(true);
          setJobTimer(60);
          if (Platform.OS !== 'web') Vibration.vibrate([500, 300, 500, 300, 500]);
        })
        .subscribe();
    } else {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      setShowJobAlert(false);
      setCurrentJob(null);
    }
    return () => { channelRef.current?.unsubscribe(); };
  }, [isOnline, riderState]);

  // Start/stop publishing location when going online/offline
  useEffect(() => {
    let watcher: any = null;
    const start = async () => {
      if (!rider?.id) return;
      watcher = await startLocationUpdates(rider.id, { timeInterval: 10000, distanceInterval: 20 });
      // send immediate location ping
      try {
        const pos = await (await import('expo-location')).getCurrentPositionAsync({ accuracy: (await import('expo-location')).Accuracy.Balanced });
        if (pos?.coords) {
          await publishLocation(rider.id, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            accuracy: pos.coords.accuracy ?? null,
            is_online: true,
          });
        }
      } catch (e) { /* ignore */ }
    };
    const stop = async () => {
      stopLocationUpdates();
      if (rider?.id) await publishLocation(rider.id, { lat: 0, lng: 0, is_online: false });
    };

    if (isOnline) start(); else stop();
    return () => { stop(); };
  }, [isOnline, rider?.id]);

  useEffect(() => {
    if (showJobAlert) {
      timerRef.current = setInterval(() => {
        setJobTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current); setShowJobAlert(false); setCurrentJob(null); return 60; }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [showJobAlert]);

  const handleAccept = async () => {
    clearInterval(timerRef.current);
    setShowJobAlert(false);
    if (!currentJob) return;
    const updatePayload: Record<string, any> = {
      status: 'Rider Assigned',
      updated_at: new Date().toISOString(),
    };

    if (currentJob.dispatch_stage === 'awaiting_final_mile_rider') {
      updatePayload.final_mile_rider_id = rider?.id || null;
      updatePayload.dispatch_stage = 'out_for_delivery';
      updatePayload.status = 'Out for Delivery';
    } else if (currentJob.routing_mode === 'relay_terminal') {
      updatePayload.assigned_rider_id = rider?.id || null;
      updatePayload.dispatch_stage = 'awaiting_source_terminal';
    } else {
      updatePayload.assigned_rider_id = rider?.id || null;
      updatePayload.dispatch_stage = 'out_for_delivery';
      updatePayload.status = 'Out for Delivery';
    }

    await supabase.from('shipments').update(updatePayload).eq('id', currentJob.id);
    await logShipmentEvent(
      currentJob.id,
      updatePayload.dispatch_stage,
      riderState,
      rider?.id,
      'rider',
      currentJob.routing_mode === 'relay_terminal'
        ? 'Rider accepted relay handoff task.'
        : 'Rider accepted delivery task.'
    );
    // publish current_shipment_id to rider_locations so Admin can correlate
    try {
      if (rider?.id) {
        const pos = await (await import('expo-location')).getCurrentPositionAsync({ accuracy: (await import('expo-location')).Accuracy.Balanced });
        await publishLocation(rider.id, {
          lat: pos?.coords?.latitude ?? 0,
          lng: pos?.coords?.longitude ?? 0,
          is_online: true,
          current_shipment_id: currentJob.id,
        });
      }
    } catch (e) { /* ignore */ }
    onAcceptJob(currentJob);
    setCurrentJob(null);
  };

  const handleDecline = () => {
    clearInterval(timerRef.current);
    setShowJobAlert(false);
    setCurrentJob(null);
    setJobTimer(60);
  };

  if (!fontsLoaded) return null;


  return (
    <View style={styles.root}>
      <Image source={require('../../assets/images/biker_bg.png')} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
      <LinearGradient colors={['rgba(2,15,9,0.6)', 'rgba(2,15,9,0.82)', '#020f09']} style={StyleSheet.absoluteFillObject as any} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeIn.duration(700)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
          <View style={[styles.statusBadge, isOnline && styles.statusBadgeOnline]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#555' }]} />
            <Text style={styles.statusBadgeText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </Animated.View>

        {/* Greeting */}
        <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.greeting}>
          <Text style={styles.greetingHi}>Good morning,</Text>
          <Text style={styles.greetingName}>{rider?.name || 'Rider'}</Text>
          <Text style={styles.greetingSub}>
            {isOnline
              ? `You are live in ${riderState}. Only eligible local and terminal jobs for your zone will appear.`
              : 'Tap the button below to start accepting deliveries.'}
          </Text>
        </Animated.View>

        {/* BIG Online Toggle */}
        <Animated.View entering={FadeInDown.duration(700).delay(300)} style={styles.toggleWrap}>
          <View style={styles.toggleOuter}>
            <PulseRing isOnline={isOnline} />
            <Pressable style={[styles.toggleBtn, isOnline && styles.toggleBtnOnline]} onPress={() => setIsOnline(v => !v)}>
              {isOnline
                ? <Wifi color="#10B981" size={40} strokeWidth={1.5} />
                : <WifiOff color="rgba(255,255,255,0.35)" size={40} strokeWidth={1.5} />
              }
              <Text style={styles.toggleLabel}>{isOnline ? "YOU'RE LIVE" : 'GO ONLINE'}</Text>
              <Text style={styles.toggleSub}>{isOnline ? 'Tap to go offline' : 'Tap to start'}</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Summary Cards */}
        <Animated.View entering={FadeInDown.duration(600).delay(450)} style={styles.summaryRow}>
          {[
            { Icon: Package,      label: 'Jobs Today', value: activeJobs },
            { Icon: CheckCircle2, label: 'Completed',  value: completedJobs },
            { Icon: Clock,        label: 'Avg. Time',  value: null },
          ].map(({ Icon, label, value }) => (
            <View key={label} style={styles.summaryCard}>
              <Icon color="#ccfd3a" size={20} strokeWidth={1.5} />
              {statsLoading && value !== null ? (
                <ActivityIndicator color="#ccfd3a" size="small" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.summaryValue}>
                  {value === null ? '28m' : String(value)}
                </Text>
              )}
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Info strip */}
        <Animated.View entering={FadeInDown.duration(600).delay(550)} style={styles.infoStrip}>
          <Bell color="#ccfd3a" size={15} strokeWidth={1.5} />
          <Text style={styles.infoStripText}>
            {isOnline
              ? 'Stay near your phone. Incoming jobs will ring loudly.'
              : 'You will not receive any jobs while offline.'}
          </Text>
        </Animated.View>
      </ScrollView>

      {/* INCOMING JOB MODAL */}
      <Modal visible={showJobAlert} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.jobAlert}>
            <View style={styles.timerBarBg}>
              <View style={[styles.timerBarFill, { width: `${(jobTimer / 60) * 100}%` as any }]} />
            </View>
            <Text style={styles.timerText}>{jobTimer}s to respond</Text>

            <View style={styles.alertIconWrap}>
              <Radio color="#ccfd3a" size={32} strokeWidth={1.5} />
            </View>
            <Text style={styles.alertTitle}>NEW DELIVERY JOB</Text>
            <Text style={styles.alertJobId}>#{currentJob?.tracking_id || '---'}</Text>
            <Text style={styles.alertJobId}>{stageLabel(currentJob?.dispatch_stage || 'awaiting_rider_acceptance')}</Text>

            {currentJob?.is_agro_shipment && (
              <View style={{ backgroundColor: 'rgba(204,253,58,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(204,253,58,0.3)', width: '100%', gap: 4 }}>
                <Text style={{ fontFamily: 'Outfit_7', fontSize: 12, color: '#ccfd3a', letterSpacing: 1.5 }}>AGRO PRODUCE SHIPMENT</Text>
                {currentJob.agro_produce_category ? <Text style={{ fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.7)' }}>{currentJob.agro_produce_category.split('(')[0].trim()}</Text> : null}
                {currentJob.requires_cold_chain ? <Text style={{ fontFamily: 'Outfit_6', fontSize: 11, color: '#F59E0B', letterSpacing: 0.5 }}>COLD CHAIN REQUIRED — Maintain temperature</Text> : null}
                {currentJob.agro_handling_notes ? <Text style={{ fontFamily: 'Outfit_4', fontSize: 11, color: 'rgba(200,255,220,0.6)' }}>{currentJob.agro_handling_notes}</Text> : null}
              </View>
            )}

            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: '#ccfd3a' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationLabel}>PICK UP FROM</Text>
                <Text style={styles.locationValue}>{currentJob?.pickup_address || '---'}</Text>
              </View>
            </View>

            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationLabel}>DELIVER TO</Text>
                <Text style={styles.locationValue}>{currentJob?.delivery_address || '---'}</Text>
              </View>
            </View>

            <View style={styles.alertMeta}>
              <View style={styles.alertMetaItem}>
                <Package color="#ccfd3a" size={16} strokeWidth={1.5} />
                <Text style={styles.alertMetaText}>{currentJob?.package_category || 'Package'}</Text>
              </View>
              <View style={styles.alertMetaItem}>
                <MapPin color="#ccfd3a" size={16} strokeWidth={1.5} />
                <Text style={styles.alertMetaText}>{currentJob?.distance_km ? `${currentJob.distance_km} km` : 'N/A'}</Text>
              </View>
            </View>

            <Pressable style={styles.acceptBtn} onPress={handleAccept}>
              <CheckCircle2 color="#002B22" size={22} strokeWidth={2} />
              <Text style={styles.acceptBtnText}>ACCEPT JOB</Text>
            </Pressable>
            <Pressable style={styles.declineBtn} onPress={handleDecline}>
              <XCircle color="#EF4444" size={17} strokeWidth={1.5} />
              <Text style={styles.declineBtnText}>Decline</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  logo: { width: 130, height: 46, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  statusBadgeOnline: { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.1)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#fff', letterSpacing: 1.5 },
  greeting: { paddingHorizontal: 28, marginBottom: 36 },
  greetingHi: { fontFamily: 'Outfit_4', fontSize: 17, color: 'rgba(200,255,220,0.55)', marginBottom: 4 },
  greetingName: { fontFamily: 'PlusJakartaSans_8', fontSize: 34, color: '#fff', marginBottom: 10 },
  greetingSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.5)', lineHeight: 24 },
  toggleWrap: { alignItems: 'center', marginBottom: 48 },
  toggleOuter: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  toggleBtn: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#111f18', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  toggleBtnOnline: { backgroundColor: '#0a2e1e', borderColor: 'rgba(16,185,129,0.5)', shadowColor: '#10B981', shadowOpacity: 0.25 },
  toggleLabel: { fontFamily: 'PlusJakartaSans_8', fontSize: 19, color: '#fff', letterSpacing: 1.5 },
  toggleSub: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.45)' },
  summaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginBottom: 24 },
  summaryCard: { flex: 1, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 16, padding: 18, alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  summaryValue: { fontFamily: 'PlusJakartaSans_8', fontSize: 22, color: '#fff' },
  summaryLabel: { fontFamily: 'Outfit_4', fontSize: 11, color: 'rgba(200,255,220,0.5)', textAlign: 'center' },
  infoStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 24, padding: 16, borderRadius: 12, backgroundColor: 'rgba(204,253,58,0.06)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.18)' },
  infoStripText: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.65)', flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  jobAlert: { backgroundColor: '#041910', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 1, borderColor: 'rgba(204,253,58,0.2)', padding: 28, paddingBottom: 50, alignItems: 'center', gap: 12 },
  timerBarBg: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  timerBarFill: { height: '100%', backgroundColor: '#ccfd3a', borderRadius: 3 },
  timerText: { fontFamily: 'Outfit_6', fontSize: 12, color: '#ccfd3a', letterSpacing: 1 },
  alertIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(204,253,58,0.1)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.25)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  alertTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 21, color: '#fff', letterSpacing: 2 },
  alertJobId: { fontFamily: 'Outfit_6', fontSize: 13, color: 'rgba(204,253,58,0.55)', letterSpacing: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, width: '100%', marginTop: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  locationDot: { width: 11, height: 11, borderRadius: 6, marginTop: 5 },
  locationLabel: { fontFamily: 'Outfit_6', fontSize: 10, color: 'rgba(200,255,220,0.45)', letterSpacing: 1.5, marginBottom: 5 },
  locationValue: { fontFamily: 'PlusJakartaSans_6', fontSize: 14, color: '#fff', lineHeight: 22 },
  alertMeta: { flexDirection: 'row', gap: 20, marginTop: 4 },
  alertMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertMetaText: { fontFamily: 'Outfit_6', fontSize: 13, color: 'rgba(200,255,220,0.75)' },
  acceptBtn: { width: '100%', backgroundColor: '#ccfd3a', borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  acceptBtnText: { fontFamily: 'Outfit_7', fontSize: 17, color: '#002B22', letterSpacing: 1 },
  declineBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  declineBtnText: { fontFamily: 'Outfit_4', fontSize: 14, color: '#EF4444' },
});
