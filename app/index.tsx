import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import RiderAuth from '../components/RiderAuth';
import RiderDashboard from '../components/RiderDashboard';
import { supabase } from '../supabase';
import { normalizeLogisticsRoles } from '../utils/logisticsRoles';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#020f09', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#ccfd3a" size="large" />
    </View>
  );
}

export default function RootIndex() {
  const [session, setSession] = useState<any>(null);
  const [rider, setRider] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const ensureRiderProfile = async (nextSession: any) => {
    const userId = nextSession?.user?.id;
    if (!userId) return null;

    const defaultName = nextSession.user.email?.split('@')[0] || 'Rider';
    const defaultProfile = {
      id: userId,
      email: nextSession.user.email || null,
      role: 'driver',
      full_name: defaultName,
      phone_number: null,
      state: 'Lagos',
      city: 'Ikeja',
      logistics_roles: ['rider'],
    };

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: created, error: createError } = await supabase
        .from('profiles')
        .upsert(defaultProfile)
        .select('*')
        .single();

      if (createError) throw createError;
      return created;
    }

    const needsRepair = !data.role || !data.state || !data.city || !Array.isArray(data.logistics_roles);
    if (!needsRepair) return data;

    const repairedProfile = {
      id: userId,
      email: data.email || nextSession.user.email || null,
      role: data.role || 'driver',
      full_name: data.full_name || defaultName,
      phone_number: data.phone_number || null,
      state: data.state || 'Lagos',
      city: data.city || 'Ikeja',
      logistics_roles: normalizeLogisticsRoles(data.logistics_roles, data.role),
    };

    const { data: repaired, error: repairError } = await supabase
      .from('profiles')
      .upsert(repairedProfile)
      .select('*')
      .single();

    if (repairError) throw repairError;
    return repaired;
  };

  const hydrateRider = async (nextSession: any) => {
    if (!nextSession?.user?.id) {
      setRider(null);
      setLoading(false);
      return;
    }

    try {
      const data = await ensureRiderProfile(nextSession);

      setRider({
        id: nextSession.user.id,
        name: data?.full_name || nextSession.user.email?.split('@')[0] || 'Rider',
        phone: data?.phone_number || '',
        state: data?.state || 'Lagos',
        city: data?.city || 'Ikeja',
        role: data?.role || 'driver',
        logisticsRoles: normalizeLogisticsRoles(data?.logistics_roles, data?.role),
        terminalCode: (data?.state || 'Lagos').slice(0, 3).toUpperCase(),
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } catch (error) {
      console.error('Failed to hydrate rider session', error);
      setRider({
        id: nextSession.user.id,
        name: nextSession.user.email?.split('@')[0] || 'Rider',
        phone: '',
        state: 'Lagos',
        city: 'Ikeja',
        role: 'driver',
        logisticsRoles: ['rider'],
        terminalCode: 'LAG',
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } finally {
      setLoading(false);
    }
  };

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
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRider(null);
    setSession(null);
  };

  if (loading) return <LoadingScreen />;

  if (!session || !rider) {
    return <RiderAuth onAuthenticated={() => {}} />;
  }

  return <RiderDashboard rider={rider} onLogout={handleLogout} />;
}
