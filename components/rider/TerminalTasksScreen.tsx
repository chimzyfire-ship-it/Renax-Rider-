import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
  Pressable,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRightLeft, Clock3, MapPin, RefreshCw, ShieldCheck, Truck, Warehouse } from 'lucide-react-native';
import { supabase } from '../../supabase';
import { fetchTerminals, stageLabel } from '../../utils/routingService';
import { hasLogisticsRole, normalizeLogisticsRoles } from '../../utils/logisticsRoles';

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatCountdown = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 'Expires now';
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} left`;
};

type PickupOfferRow = {
  id: string;
  pickup_request_id: string;
  shipment_id: string;
  attempt_order?: number | null;
  offer_reason?: string | null;
  offered_at?: string | null;
  offer_expires_at?: string | null;
  candidate_score?: number | null;
  score_breakdown?: Record<string, any> | null;
  shipment?: Record<string, any> | null;
  queue?: Record<string, any> | null;
};

export default function TerminalTasksScreen({ rider, onOpenJob }: { rider: any; onOpenJob: (job: any) => void }) {
  const [relayJobs, setRelayJobs] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [pickupAgent, setPickupAgent] = useState<any | null>(null);
  const [pickupOffers, setPickupOffers] = useState<PickupOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  const logisticsRoles = normalizeLogisticsRoles(rider?.logisticsRoles, rider?.role);
  const canSeePickupOffers = hasLogisticsRole(logisticsRoles, 'first_mile_pickup', rider?.role);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const riderId = rider?.id || '00000000-0000-0000-0000-000000000000';
      const [terminalData, shipmentResult, pickupAgentResult] = await Promise.all([
        fetchTerminals(),
        supabase
          .from('shipments')
          .select('*')
          .eq('routing_mode', 'relay_terminal')
          .or(`first_mile_pickup_agent_id.eq.${riderId},final_mile_rider_id.eq.${riderId},assigned_rider_id.eq.${riderId}`)
          .in('dispatch_stage', ['awaiting_source_terminal', 'awaiting_final_mile_rider', 'out_for_delivery'])
          .order('created_at', { ascending: false }),
        canSeePickupOffers
          ? supabase
            .from('first_mile_pickup_pool_live')
            .select('*')
            .eq('driver_id', riderId)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      setTerminals(terminalData || []);
      setRelayJobs(shipmentResult.data || []);
      setPickupAgent(pickupAgentResult?.data || null);

      if (!pickupAgentResult?.data?.id) {
        setPickupOffers([]);
        return;
      }

      const { data: offerRows } = await supabase
        .from('pickup_request_assignment_attempts')
        .select('*')
        .eq('pickup_agent_id', pickupAgentResult.data.id)
        .eq('attempt_status', 'offered')
        .order('offered_at', { ascending: false });

      if (!offerRows?.length) {
        setPickupOffers([]);
        return;
      }

      const pickupRequestIds = Array.from(new Set(offerRows.map((row: any) => row.pickup_request_id).filter(Boolean)));
      const shipmentIds = Array.from(new Set(offerRows.map((row: any) => row.shipment_id).filter(Boolean)));

      const [watchlistResult, shipmentRowsResult] = await Promise.all([
        supabase
          .from('first_mile_dispatch_watchlist')
          .select('*')
          .in('pickup_request_id', pickupRequestIds),
        supabase
          .from('shipments')
          .select('id, tracking_id, pickup_address, delivery_address, pickup_state, delivery_state, package_category, weight_kg, estimated_price, dispatch_stage, active_pickup_request_id')
          .in('id', shipmentIds),
      ]);

      const watchlistMap = new Map((watchlistResult.data || []).map((row: any) => [row.pickup_request_id, row]));
      const shipmentMap = new Map((shipmentRowsResult.data || []).map((row: any) => [row.id, row]));

      setPickupOffers(offerRows.map((row: any) => ({
        ...row,
        queue: watchlistMap.get(row.pickup_request_id) || null,
        shipment: shipmentMap.get(row.shipment_id) || null,
      })));
    } catch (error) {
      console.error('Failed to load terminal tasks', error);
      setRelayJobs([]);
      setPickupOffers([]);
    } finally {
      setLoading(false);
    }
  }, [canSeePickupOffers, rider?.id]);

  useEffect(() => {
    loadData();
  }, [loadData, rider?.assignedTerminalId, rider?.preferredTerminalCode]);

  useEffect(() => {
    if (!pickupOffers.length) return undefined;
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pickupOffers.length]);

  useEffect(() => {
    if (!rider?.id) return undefined;

    const channel = supabase
      .channel(`rider-terminal-dispatch-${rider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_request_assignment_attempts' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_requests' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => loadData())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') return;
        Vibration.vibrate(40);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [loadData, rider?.id]);

  const riderTerminal = useMemo(
    () =>
      terminals.find((terminal) => terminal.id === rider?.assignedTerminalId)
      || terminals.find((terminal) => terminal.code === rider?.preferredTerminalCode)
      || terminals.find((terminal) => terminal.code === rider?.terminalCode)
      || terminals.find((terminal) => terminal.state === rider?.state),
    [rider?.assignedTerminalId, rider?.preferredTerminalCode, rider?.state, rider?.terminalCode, terminals]
  );

  const handleOfferResponse = async (offer: PickupOfferRow, response: 'accepted' | 'declined') => {
    setOfferBusyId(`${response}:${offer.id}`);
    try {
      const { error } = await supabase.rpc('respond_first_mile_pickup_offer', {
        p_payload: {
          attempt_id: offer.id,
          response,
          notes: response === 'accepted'
            ? 'Driver accepted the controlled first-mile pickup offer.'
            : 'Driver declined the controlled first-mile pickup offer.',
        },
      });
      if (error) throw error;

      await loadData();

      if (response === 'accepted' && offer.shipment_id) {
        const { data: assignedShipment } = await supabase
          .from('shipments')
          .select('*')
          .eq('id', offer.shipment_id)
          .maybeSingle();

        if (assignedShipment) {
          onOpenJob(assignedShipment);
        }
      }
    } catch (error) {
      console.error(`Unable to ${response} pickup offer`, error);
    } finally {
      setOfferBusyId(null);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.titleWrap}>
          <Text style={styles.screenTitle}>Terminal Tasks</Text>
          <Text style={styles.screenSub}>
            Relay shipments, hub handoffs, final-mile releases, and controlled pickup offers for {riderTerminal?.city || rider?.city || 'your zone'}.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(120)} style={styles.terminalCard}>
          <View style={styles.terminalBadge}>
            <Warehouse color="#ccfd3a" size={18} />
            <Text style={styles.terminalBadgeText}>Assigned Hub</Text>
          </View>
          <Text style={styles.terminalName}>{riderTerminal?.name || rider?.assignedTerminalName || 'RENAX Hub'}</Text>
          <Text style={styles.terminalAddress}>{riderTerminal?.address || 'Terminal address not loaded yet.'}</Text>
          <Pressable style={styles.refreshBtn} onPress={loadData}>
            <RefreshCw color="#002B22" size={15} />
            <Text style={styles.refreshBtnText}>Refresh Dispatch</Text>
          </Pressable>
        </Animated.View>

        {canSeePickupOffers ? (
          <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Controlled Pickup Offers</Text>
                <Text style={styles.sectionSub}>
                  These are private RENAX first-mile offers for home-to-terminal pickup on inter-state shipments.
                </Text>
              </View>
              <View style={styles.offerCountPill}>
                <ShieldCheck color="#ccfd3a" size={14} />
                <Text style={styles.offerCountText}>{pickupOffers.length} live</Text>
              </View>
            </View>

            {!pickupAgent ? (
              <Text style={styles.emptyText}>
                Your account is marked for first-mile work, but ops has not yet enrolled you into the controlled pickup pool.
              </Text>
            ) : loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#ccfd3a" size="small" />
                <Text style={styles.loadingText}>Loading pickup offers...</Text>
              </View>
            ) : pickupOffers.length === 0 ? (
              <Text style={styles.emptyText}>
                No timed pickup offers are waiting for you right now. When dispatch ranks you for a house-to-terminal request, it will appear here.
              </Text>
            ) : (
              <View style={styles.offerList}>
                {pickupOffers.map((offer, index) => {
                  const expiresAtMs = offer.offer_expires_at ? new Date(offer.offer_expires_at).getTime() : NaN;
                  const remainingMs = expiresAtMs - tick;
                  const shipment = offer.shipment || {};
                  const queue = offer.queue || {};

                  return (
                    <Animated.View key={offer.id} entering={FadeInDown.duration(400).delay(180 + index * 60)} style={styles.offerCard}>
                      <View style={styles.offerTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.offerTracking}>{shipment.tracking_id || offer.shipment_id}</Text>
                          <Text style={styles.offerRoute}>{shipment.pickup_state || queue.pickup_state || 'Unknown'} {'->'} {shipment.delivery_state || queue.pickup_city || 'Unknown'}</Text>
                        </View>
                        <View style={styles.offerTimerPill}>
                          <Clock3 color="#FACC15" size={14} />
                          <Text style={styles.offerTimerText}>{formatCountdown(remainingMs)}</Text>
                        </View>
                      </View>

                      <View style={styles.offerInfoRow}>
                        <MapPin color="#ccfd3a" size={15} />
                        <Text style={styles.offerInfoText}>{shipment.pickup_address || 'Pickup address unavailable'}</Text>
                      </View>

                      <View style={styles.offerInfoRow}>
                        <ArrowRightLeft color="#ccfd3a" size={15} />
                        <Text style={styles.offerInfoText}>
                          To {queue.source_terminal_name || riderTerminal?.name || 'source terminal'} before relay dispatch.
                        </Text>
                      </View>

                      <View style={styles.offerFactsRow}>
                        <Text style={styles.offerFact}>Score {offer.candidate_score ?? 'N/A'}</Text>
                        <Text style={styles.offerFact}>{shipment.package_category || 'Parcel'}{shipment.weight_kg ? ` • ${shipment.weight_kg}kg` : ''}</Text>
                        <Text style={styles.offerFact}>{queue.priority || 'normal'} priority</Text>
                      </View>

                      {offer.offer_reason ? (
                        <Text style={styles.offerReason}>{offer.offer_reason}</Text>
                      ) : null}

                      <View style={styles.offerActionsRow}>
                        <Pressable
                          style={styles.offerDeclineBtn}
                          onPress={() => handleOfferResponse(offer, 'declined')}
                          disabled={offerBusyId === `declined:${offer.id}` || offerBusyId === `accepted:${offer.id}`}
                        >
                          <Text style={styles.offerDeclineText}>
                            {offerBusyId === `declined:${offer.id}` ? 'Declining...' : 'Decline'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.offerAcceptBtn}
                          onPress={() => handleOfferResponse(offer, 'accepted')}
                          disabled={offerBusyId === `accepted:${offer.id}` || offerBusyId === `declined:${offer.id}`}
                        >
                          <Truck color="#002B22" size={16} />
                          <Text style={styles.offerAcceptText}>
                            {offerBusyId === `accepted:${offer.id}` ? 'Accepting...' : 'Accept Offer'}
                          </Text>
                        </Pressable>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(500).delay(210)} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Assigned Relay Work</Text>
              <Text style={styles.sectionSub}>
                Your live hub handoffs, source-terminal drops, and final-mile relay tasks.
              </Text>
            </View>
            <View style={styles.offerCountPill}>
              <Truck color="#ccfd3a" size={14} />
              <Text style={styles.offerCountText}>{relayJobs.length} active</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#ccfd3a" size="large" />
              <Text style={styles.centerStateText}>Loading relay work...</Text>
            </View>
          ) : relayJobs.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.centerStateText}>No relay shipments are waiting in your zone right now.</Text>
            </View>
          ) : (
            relayJobs.map((job, index) => (
              <Animated.View key={job.id} entering={FadeInDown.duration(450).delay(240 + index * 60)} style={styles.jobCard}>
                <View style={styles.jobCardHead}>
                  <View>
                    <Text style={styles.jobId}>{job.tracking_id || job.id}</Text>
                    <Text style={styles.jobStage}>{stageLabel(job.dispatch_stage || 'pending_routing')}</Text>
                  </View>
                  <View style={styles.stagePill}>
                    <Text style={styles.stagePillText}>{job.pickup_state} {'->'} {job.delivery_state}</Text>
                  </View>
                </View>

                <View style={styles.routeRow}>
                  <MapPin color="#ccfd3a" size={16} />
                  <Text style={styles.routeText}>{job.pickup_address}</Text>
                </View>
                <View style={styles.routeRow}>
                  <ArrowRightLeft color="#ccfd3a" size={16} />
                  <Text style={styles.routeText}>{job.delivery_address}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>Created {formatDate(job.created_at)}</Text>
                  <Text style={styles.metaText}>{job.distance_km ? `${job.distance_km} km` : 'Distance N/A'}</Text>
                </View>

                <Pressable style={styles.openBtn} onPress={() => onOpenJob(job)}>
                  <Truck color="#002B22" size={18} />
                  <Text style={styles.openBtnText}>Open Task</Text>
                </Pressable>
              </Animated.View>
            ))
          )}
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
  titleWrap: { paddingHorizontal: 24, marginBottom: 18 },
  screenTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 30, color: '#fff', marginBottom: 4 },
  screenSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.5)' },
  terminalCard: { marginHorizontal: 24, marginBottom: 18, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 20 },
  terminalBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  terminalBadgeText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#ccfd3a', letterSpacing: 1 },
  terminalName: { fontFamily: 'PlusJakartaSans_6', fontSize: 20, color: '#fff', marginBottom: 8 },
  terminalAddress: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.65)', lineHeight: 22, marginBottom: 14 },
  refreshBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  refreshBtnText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#002B22' },
  sectionCard: { marginHorizontal: 24, marginBottom: 18, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_6', fontSize: 18, color: '#fff', marginBottom: 4 },
  sectionSub: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.55)', maxWidth: 560, lineHeight: 20 },
  offerCountPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(204,253,58,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  offerCountText: { fontFamily: 'Outfit_7', fontSize: 11, color: '#ccfd3a' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.65)' },
  emptyText: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.55)', lineHeight: 22 },
  offerList: { gap: 12 },
  offerCard: { backgroundColor: 'rgba(8,37,24,0.92)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(204,253,58,0.18)', padding: 16 },
  offerTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  offerTracking: { fontFamily: 'PlusJakartaSans_6', fontSize: 16, color: '#fff' },
  offerRoute: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.62)', marginTop: 4 },
  offerTimerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(250,204,21,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  offerTimerText: { fontFamily: 'Outfit_7', fontSize: 11, color: '#FACC15' },
  offerInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  offerInfoText: { flex: 1, fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(220,255,232,0.84)', lineHeight: 20 },
  offerFactsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4, marginBottom: 10 },
  offerFact: { fontFamily: 'Outfit_6', fontSize: 11, color: '#ccfd3a', backgroundColor: 'rgba(204,253,58,0.09)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  offerReason: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.58)', lineHeight: 18, marginBottom: 12 },
  offerActionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  offerDeclineBtn: { borderWidth: 1, borderColor: 'rgba(251,113,133,0.55)', backgroundColor: 'rgba(76,5,25,0.58)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  offerDeclineText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#FDA4AF' },
  offerAcceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  offerAcceptText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#002B22' },
  centerState: { paddingVertical: 28, alignItems: 'center', justifyContent: 'center' },
  centerStateText: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.5)' },
  jobCard: { marginBottom: 14, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  jobCardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  jobId: { fontFamily: 'Outfit_7', fontSize: 15, color: '#ccfd3a' },
  jobStage: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.55)', marginTop: 4 },
  stagePill: { backgroundColor: 'rgba(204,253,58,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  stagePillText: { fontFamily: 'Outfit_6', fontSize: 11, color: '#ccfd3a' },
  routeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  routeText: { flex: 1, fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.8)', lineHeight: 20 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 16, flexWrap: 'wrap' },
  metaText: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.45)' },
  openBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  openBtnText: { fontFamily: 'Outfit_7', fontSize: 13, color: '#002B22' },
});
