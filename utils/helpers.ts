import { Platform, Linking, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';

export const generatePIN = () => Math.floor(1000 + Math.random() * 9000).toString();

export const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
};

export const animateUI = () => {
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }
};

export const decodePolyline = (t: string) => {
    let n = 0, o = 0, e = 0, r = 0, l = [], h = 0, i = 0, a = null, c = 1e5;
    for (; n < t.length;) {
        a = null, h = 0, i = 0;
        do { a = t.charCodeAt(n++) - 63, i |= (31 & a) << h, h += 5 } while (a >= 32);
        e += 1 & i ? ~(i >> 1) : i >> 1, h = i = 0;
        do { a = t.charCodeAt(n++) - 63, i |= (31 & a) << h, h += 5 } while (a >= 32);
        r += 1 & i ? ~(i >> 1) : i >> 1, l.push({ latitude: e / c, longitude: r / c })
    }
    return l;
};

export const openGoogleMaps = (lat: number, lng: number, label: string) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=', web: 'https://maps.google.com/?q=' });
    const latLng = `${lat},${lng}`;
    const url = Platform.select({
        ios: `${scheme}${label}@${latLng}`,
        android: `${scheme}${latLng}(${label})`,
        web: `${scheme}${latLng}`
    });
    if (url) Linking.openURL(url);
};

export const openWhatsApp = (phone: string, text: string) => {
    Linking.openURL(`whatsapp://send?text=${text}&phone=${phone}`);
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
};
