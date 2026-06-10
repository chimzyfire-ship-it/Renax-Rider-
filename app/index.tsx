import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import RiderAuth from '../components/RiderAuth';
import RiderDashboard from '../components/RiderDashboard';
import { supabase } from '../supabase';
import {
  acceptDeliverAndEarnOperatorInvite,
  fetchDeliverAndEarnOperatorAccessContext,
  type DeliverAndEarnOperatorAccessContext,
} from '../utils/deliverAndEarn';
import { normalizeLogisticsRoles } from '../utils/logisticsRoles';
import { fetchTerminals } from '../utils/routingService';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#020f09', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#ccfd3a" size="large" />
    </View>
  );
}

function getPendingDeliverEarnInviteToken() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('deliver_earn_invite') || params.get('de_invite');
  } catch {
    return null;
  }
}

function clearDeliverEarnInviteTokenFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('deliver_earn_invite');
    url.searchParams.delete('de_invite');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL cleanup is non-critical.
  }
}

export default function RootIndex() {
  const [session, setSession] = useState<any>(null);
  const [rider, setRider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInviteToken, setPendingInviteToken] = useState(() => getPendingDeliverEarnInviteToken());
  const [authMessage, setAuthMessage] = useState('');
  const pendingInviteTokenRef = useRef<string | null>(pendingInviteToken);
  const pendingInviteCodeRef = useRef<string | null>(null);

  const rememberDeliverEarnInviteCode = useCallback((inviteCode?: string | null) => {
    pendingInviteCodeRef.current = inviteCode?.trim() || null;
  }, []);

  const ensureRiderProfile = useCallback(async (nextSession: any, operatorContext?: DeliverAndEarnOperatorAccessContext | null) => {
    const userId = nextSession?.user?.id;
    if (!userId) return null;

    const defaultName = nextSession.user.email?.split('@')[0] || 'Rider';
    const isDeliverAndEarnOnly =
      operatorContext?.operator_mode === 'deliver_and_earn'
      && !operatorContext?.is_staff_operator;
    const defaultProfile = {
      id: userId,
      email: nextSession.user.email || null,
      role: 'driver',
      full_name: defaultName,
      phone_number: null,
      state: 'Lagos',
      city: 'Ikeja',
      logistics_roles: ['rider'],
      preferred_terminal_code: 'LOS',
    };

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      if (isDeliverAndEarnOnly) {
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: nextSession.user.email || null,
            role: 'customer',
            full_name: defaultName,
            phone_number: null,
            state: operatorContext?.operating_state || 'Lagos',
            city: operatorContext?.operating_city || 'Ikeja',
          })
          .select('*')
          .single();

        if (createError) throw createError;
        return created;
      }

      const { data: created, error: createError } = await supabase
        .from('profiles')
        .upsert(defaultProfile)
        .select('*')
        .single();

      if (createError) throw createError;
      return created;
    }

    if (isDeliverAndEarnOnly) return data;

    const repairedRoles = normalizeLogisticsRoles(data.logistics_roles, data.role);

    const needsRepair =
      !data.role
      || !data.state
      || !data.city
      || !Array.isArray(data.logistics_roles)
      || !data.preferred_terminal_code;
    if (!needsRepair) return data;

    const repairedProfile = {
      id: userId,
      email: data.email || nextSession.user.email || null,
      role: data.role || 'driver',
      full_name: data.full_name || defaultName,
      phone_number: data.phone_number || null,
      state: data.state || 'Lagos',
      city: data.city || 'Ikeja',
      logistics_roles: repairedRoles,
      preferred_terminal_code: data.preferred_terminal_code || 'LOS',
    };

    const { data: repaired, error: repairError } = await supabase
      .from('profiles')
      .upsert(repairedProfile)
      .select('*')
      .single();

    if (repairError) throw repairError;
    return repaired;
  }, []);

  const hydrateRider = useCallback(async (nextSession: any) => {
    if (!nextSession?.user?.id) {
      setRider(null);
      setLoading(false);
      return;
    }

    try {
      setAuthMessage('');

      const inviteToken = pendingInviteTokenRef.current;
      const inviteCode = pendingInviteCodeRef.current;
      if (inviteToken || inviteCode) {
        pendingInviteTokenRef.current = null;
        pendingInviteCodeRef.current = null;
        try {
          await acceptDeliverAndEarnOperatorInvite({
            inviteToken,
            inviteCode,
          });
        } catch (inviteError) {
          const accessError = new Error(inviteError instanceof Error ? inviteError.message : 'Could not activate this Deliver & Earn Rider invite.');
          (accessError as any).code = 'deliver_earn_access_denied';
          throw accessError;
        }
        clearDeliverEarnInviteTokenFromUrl();
        setPendingInviteToken(null);
      }

      const operatorContext = await fetchDeliverAndEarnOperatorAccessContext();
      const isDeliverAndEarnOnly =
        operatorContext.operator_mode === 'deliver_and_earn'
        && !operatorContext.is_staff_operator;

      if (isDeliverAndEarnOnly && !operatorContext.can_use_rider_app) {
        const inviteState = operatorContext.invite_status
          ? operatorContext.invite_status.replace(/_/g, ' ')
          : 'not active';
        const accessError = new Error(`Deliver & Earn Rider access is ${inviteState}. Ask RENAX operations for a fresh Rider invite, then sign in with that invite.`);
        (accessError as any).code = 'deliver_earn_access_denied';
        throw accessError;
      }

      const data = await ensureRiderProfile(nextSession, operatorContext);
      const terminals = await fetchTerminals();
      const assignedTerminal =
        terminals.find((terminal) => terminal.id === data?.assigned_terminal_id)
        || terminals.find((terminal) => terminal.code === data?.preferred_terminal_code)
        || terminals.find((terminal) => terminal.state?.toLowerCase() === String(data?.state || '').toLowerCase())
        || null;

      const normalizedRoles = normalizeLogisticsRoles(data?.logistics_roles, data?.role);
      const logisticsRoles = isDeliverAndEarnOnly
        ? ['deliver_and_earn']
        : normalizedRoles;

      setRider({
        id: nextSession.user.id,
        name: data?.full_name || nextSession.user.email?.split('@')[0] || 'Rider',
        phone: data?.phone_number || '',
        state: operatorContext.operating_state || data?.state || 'Lagos',
        city: operatorContext.operating_city || data?.city || 'Ikeja',
        role: isDeliverAndEarnOnly ? 'customer' : (data?.role || 'driver'),
        logisticsRoles,
        operatorMode: operatorContext.operator_mode,
        canUseRiderApp: operatorContext.can_use_rider_app,
        isStaffOperator: Boolean(operatorContext.is_staff_operator),
        terminalCode: assignedTerminal?.code || data?.preferred_terminal_code || (data?.state || 'Lagos').slice(0, 3).toUpperCase(),
        preferredTerminalCode: data?.preferred_terminal_code || assignedTerminal?.code || 'LOS',
        assignedTerminalId: data?.assigned_terminal_id || assignedTerminal?.id || null,
        assignedTerminalName: assignedTerminal?.name || '',
        assignedTerminalAddress: assignedTerminal?.address || '',
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } catch (error) {
      console.error('Failed to hydrate rider session', error);
      if ((error as any)?.code === 'deliver_earn_access_denied') {
        await supabase.auth.signOut();
        clearDeliverEarnInviteTokenFromUrl();
        setPendingInviteToken(null);
        setAuthMessage(error instanceof Error ? error.message : 'Deliver & Earn Rider access is not active.');
        setRider(null);
        setSession(null);
        return;
      }

      setRider({
        id: nextSession.user.id,
        name: nextSession.user.email?.split('@')[0] || 'Rider',
        phone: '',
        state: 'Lagos',
        city: 'Ikeja',
        role: 'driver',
        logisticsRoles: ['rider'],
        operatorMode: 'renax_staff',
        canUseRiderApp: true,
        isStaffOperator: true,
        terminalCode: 'LAG',
        preferredTerminalCode: 'LAG',
        assignedTerminalId: null,
        assignedTerminalName: '',
        assignedTerminalAddress: '',
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } finally {
      setLoading(false);
    }
  }, [ensureRiderProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      setSession(nextSession);
      if (nextSession) {
        hydrateRider(nextSession);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setLoading(true);
        hydrateRider(nextSession);
      } else {
        setRider(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrateRider]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRider(null);
    setSession(null);
  };

  if (loading) return <LoadingScreen />;

  if (!session || !rider) {
    return (
      <RiderAuth
        onAuthenticated={() => {}}
        pendingDeliverEarnInviteToken={pendingInviteToken}
        authMessage={authMessage}
        onPendingDeliverEarnInviteCode={rememberDeliverEarnInviteCode}
      />
    );
  }

  return <RiderDashboard rider={rider} onLogout={handleLogout} />;
}
