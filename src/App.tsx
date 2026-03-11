/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Settings, 
  Home, 
  AlertTriangle, 
  ShieldCheck, 
  MapPin, 
  Vibrate, 
  Moon, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Info,
  CheckCircle2,
  Search,
  Zap,
  X
} from 'lucide-react';
import { cn } from './lib/utils';
import { Alert, UserSettings, Location, VIBRATION_PATTERNS } from './types';

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  className, 
  variant = 'primary',
  disabled = false 
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  className?: string, 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
  disabled?: boolean
}) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-zinc-800 text-white hover:bg-zinc-900',
    outline: 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50',
    ghost: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm', className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [step, setStep] = useState<'onboarding' | 'dashboard' | 'alerts' | 'settings'>('onboarding');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<{ lastAlert: Alert | null, count3h: number }>({ lastAlert: null, count3h: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [userLocations, setUserLocations] = useState<Location[]>([]);
  const [allLocations, setAllLocations] = useState<{name: string}[]>([]);
  const [isConsentChecked, setIsConsentChecked] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFlashing, setIsFlashing] = useState(false);

  // Flashlight logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let stream: MediaStream | null = null;

    const startFlashing = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        const track = stream.getVideoTracks()[0];
        
        let on = false;
        interval = setInterval(async () => {
          on = !on;
          try {
            await (track as any).applyConstraints({
              advanced: [{ torch: on }]
            });
          } catch (e) {
            console.error("Torch not supported", e);
            clearInterval(interval);
          }
        }, 1000); // Slow pace
      } catch (e) {
        console.error("Camera access denied or flashlight not available", e);
      }
    };

    const stopFlashing = () => {
      if (interval) clearInterval(interval);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };

    if (isFlashing && settings?.flashlight_enabled) {
      startFlashing();
    } else {
      stopFlashing();
    }

    return () => stopFlashing();
  }, [isFlashing, settings?.flashlight_enabled]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [alertsRes, summaryRes, settingsRes] = await Promise.all([
        fetch('/api/alerts'),
        fetch('/api/summary'),
        fetch('/api/settings')
      ]);
      
      const alertsData = await alertsRes.json();
      const summaryData = await summaryRes.json();
      const settingsData = await settingsRes.json();

      setAlerts(alertsData);
      setSummary(summaryData);
      setSettings(settingsData.settings);
      setUserLocations(settingsData.locations);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAlertEmoji = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('rocket') || t.includes('missile')) return '🚀';
    if (t.includes('uav') || t.includes('drone') || t.includes('aircraft') || t.includes('plane')) return '🛩️';
    if (t.includes('terrorist') || t.includes('infiltration')) return '🥷';
    if (t.includes('earthquake')) return '🫨';
    if (t.includes('radiological')) return '☢️';
    if (t.includes('chemical')) return '🧪';
    return '⚠️';
  };

  // Dedicated effect for all locations to ensure it's loaded
  useEffect(() => {
    const fetchAllLocations = async () => {
      try {
        const res = await fetch('/api/locations/all');
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllLocations(data);
        }
      } catch (error) {
        console.error('Error fetching all locations:', error);
      }
    };
    fetchAllLocations();
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Vibration test
  const testVibration = (profile: keyof typeof VIBRATION_PATTERNS) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(VIBRATION_PATTERNS[profile]);
    }
  };

  // Handlers
  const handleAddLocation = async (name: string) => {
    if (!name.trim()) return;
    await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    setNewLocationName('');
    setLocationSearch('');
    setShowLocationResults(false);
    fetchData();
  };

  const handleDeleteLocation = async (name: string) => {
    await fetch(`/api/locations/${name}`, { method: 'DELETE' });
    fetchData();
  };

  const handleUpdateSettings = async (newSettings: Partial<UserSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  };

  // --- Onboarding Screens ---

  const onboardingScreens = [
    {
      title: "Welcome to QuietAlert",
      description: "A calmer alternative to system sirens. We provide rocket alerts via gentle vibration patterns.",
      icon: <Bell className="w-12 h-12 text-emerald-600" />,
      content: (
        <div className="space-y-4 text-sm text-zinc-600 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
          <p>• This app uses public Home Front Command data.</p>
          <p>• It does NOT replace official system alerts.</p>
          <p>• You can only change system alerts in your phone's settings.</p>
        </div>
      )
    },
    {
      title: "Consent & Risk",
      description: "Please acknowledge the limitations of this tool.",
      icon: <ShieldCheck className="w-12 h-12 text-emerald-600" />,
      content: (
        <div className="space-y-6">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              QuietAlert cannot guarantee 100% delivery of every alert. Network delays or service outages may occur. Always keep official channels active.
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={cn(
              "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
              isConsentChecked ? "bg-emerald-600 border-emerald-600" : "border-zinc-300 group-hover:border-emerald-500"
            )}>
              {isConsentChecked && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
            <input 
              type="checkbox" 
              className="hidden" 
              checked={isConsentChecked} 
              onChange={(e) => setIsConsentChecked(e.target.checked)} 
            />
            <span className="text-sm font-medium text-zinc-700">I understand the risks and limitations.</span>
          </label>
        </div>
      )
    },
    {
      title: "Your Locations",
      description: "Which areas should we monitor for you?",
      icon: <MapPin className="w-12 h-12 text-emerald-600" />,
      content: (
        <div className="space-y-4 relative">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <Search className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  placeholder="Search city (e.g. Tel Aviv)" 
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  value={locationSearch}
                  onChange={(e) => {
                    setLocationSearch(e.target.value);
                    setShowLocationResults(true);
                  }}
                  onFocus={() => setShowLocationResults(true)}
                  onBlur={() => setTimeout(() => setShowLocationResults(false), 200)}
                />
                {showLocationResults && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto overscroll-contain">
                    <div className="p-2 border-b border-zinc-50 bg-zinc-50/50 flex items-center justify-between sticky top-0 z-10">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        {locationSearch ? 'Search Results' : 'All Locations'}
                      </span>
                      <button onClick={() => setShowLocationResults(false)} className="text-zinc-400 hover:text-zinc-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {allLocations.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-zinc-400">Loading cities...</p>
                      </div>
                    ) : (
                      <>
                        {allLocations
                          .filter(loc => loc.name.toLowerCase().includes(locationSearch.toLowerCase()))
                          .slice(0, 50)
                          .map(loc => (
                            <button
                              key={loc.name}
                              className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm text-zinc-700 border-b border-zinc-50 last:border-none transition-colors"
                              onClick={() => handleAddLocation(loc.name)}
                            >
                              {loc.name}
                            </button>
                          ))}
                        {allLocations.filter(loc => loc.name.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                          <div className="px-4 py-6 text-center">
                            <p className="text-xs text-zinc-400 italic">No cities found matching "{locationSearch}"</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {userLocations.map(loc => (
              <div key={loc.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                <span className="text-sm font-medium text-zinc-700">{loc.name}</span>
                <button onClick={() => handleDeleteLocation(loc.name)} className="text-zinc-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: "Vibration Profile",
      description: "Choose how you want to feel the alerts.",
      icon: <Vibrate className="w-12 h-12 text-emerald-600" />,
      content: (
        <div className="grid grid-cols-2 gap-3">
          {(['short', 'long', 'intense', 'pulse'] as const).map(profile => (
            <button
              key={profile}
              onClick={() => {
                handleUpdateSettings({ vibration_profile: profile });
                testVibration(profile);
              }}
              className={cn(
                "p-4 rounded-2xl border-2 text-left transition-all",
                settings?.vibration_profile === profile 
                  ? "border-emerald-600 bg-emerald-50" 
                  : "border-zinc-100 bg-zinc-50 hover:border-zinc-200"
              )}
            >
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{profile}</div>
              <div className="text-xs text-zinc-600">Tap to test</div>
            </button>
          ))}
        </div>
      )
    }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'onboarding') {
    const current = onboardingScreens[onboardingStep];
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col p-6 max-w-md mx-auto">
        <div className="flex-1 flex flex-col justify-center">
          <motion.div 
            key={onboardingStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-white rounded-3xl shadow-sm border border-zinc-100">
                {current.icon}
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{current.title}</h1>
                <p className="text-zinc-500 leading-relaxed">{current.description}</p>
              </div>
            </div>
            
            {current.content}
          </motion.div>
        </div>

        <div className="pt-8 space-y-4">
          <div className="flex justify-center gap-2">
            {onboardingScreens.map((_, i) => (
              <div 
                key={i} 
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === onboardingStep ? "w-8 bg-emerald-600" : "w-2 bg-zinc-200"
                )} 
              />
            ))}
          </div>
          <Button 
            className="w-full py-4 text-lg"
            disabled={onboardingStep === 1 && !isConsentChecked || onboardingStep === 2 && userLocations.length === 0}
            onClick={() => {
              if (onboardingStep < onboardingScreens.length - 1) {
                setOnboardingStep(onboardingStep + 1);
              } else {
                setStep('dashboard');
              }
            }}
          >
            {onboardingStep === onboardingScreens.length - 1 ? "Finish Setup" : "Continue"}
          </Button>
        </div>
      </div>
    );
  }

  // --- Main App Layout ---

  const NavItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 py-2 px-4 transition-colors",
        active ? "text-emerald-600" : "text-zinc-400 hover:text-zinc-600"
      )}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );

  const getStatusColor = () => {
    if (!summary.lastAlert) return 'bg-emerald-500';
    const diff = Date.now() - Number(summary.lastAlert.timestamp_utc);
    if (diff < 3 * 60 * 60 * 1000) return 'bg-red-500';
    if (diff < 12 * 60 * 60 * 1000) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getStatusText = () => {
    if (!summary.lastAlert) return 'No recent alerts';
    const diff = Date.now() - Number(summary.lastAlert.timestamp_utc);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) return 'Alert within last hour';
    return `Last alert ${hours}h ago`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col max-w-md mx-auto border-x border-zinc-200 shadow-xl relative overflow-hidden">
      {/* Header */}
      <header className="bg-white border-bottom border-zinc-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-zinc-900 tracking-tight">QuietAlert</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", getStatusColor())} />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence mode="wait">
          {step === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Status Card */}
              <Card className="bg-zinc-900 text-white border-none overflow-hidden relative">
                <div className={cn("absolute top-0 right-0 w-32 h-32 blur-3xl opacity-20 -mr-16 -mt-16", getStatusColor())} />
                <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Current Status</div>
                      <div className="text-xl font-bold">{getStatusText()}</div>
                    </div>
                    <div className={cn("p-2 rounded-xl", getStatusColor().replace('bg-', 'bg-opacity-20 bg-'))}>
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex gap-4 pt-2 border-t border-white/10">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Last 3h</div>
                      <div className="text-lg font-bold">{summary.count3h}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Monitored</div>
                      <div className="text-lg font-bold">{userLocations.length} Areas</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Locations Quick View */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Your Locations</h2>
                  <button onClick={() => setStep('settings')} className="text-xs text-emerald-600 font-medium">Manage</button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 no-scrollbar">
                  {userLocations.map(loc => (
                    <div key={loc.id} className="shrink-0 px-4 py-2 bg-white rounded-full border border-zinc-100 text-sm font-medium text-zinc-700 shadow-sm">
                      {loc.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Alerts Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Recent Alerts</h2>
                  <button onClick={() => setStep('alerts')} className="text-xs text-emerald-600 font-medium">View All</button>
                </div>
                <div className="space-y-2">
                  {alerts.slice(0, 3).map(alert => (
                    <div key={alert.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                      <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0 text-xl">
                        {getAlertEmoji(alert.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-zinc-900 truncate">{alert.location}</div>
                        <div className="text-xs text-zinc-500">{alert.type} • {new Date(alert.timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-300" />
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-8 text-zinc-400 text-sm italic">No alerts in the last 3 hours</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 'alerts' && (
            <motion.div 
              key="alerts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Alert History</h2>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Last 3 Hours</div>
              </div>

              <div className="space-y-4">
                {/* Grouped by Hour */}
                {Array.from(new Set(alerts.map(a => new Date(a.timestamp_utc).getHours()))).sort((a: number, b: number) => b - a).map(hour => (
                  <div key={hour} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-zinc-100" />
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{hour}:00 - {hour}:59</span>
                      <div className="h-px flex-1 bg-zinc-100" />
                    </div>
                    {alerts.filter(a => new Date(a.timestamp_utc).getHours() === hour).map(alert => (
                      <div key={alert.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0 text-xl">
                          {getAlertEmoji(alert.type)}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-zinc-900">{alert.location}</div>
                          <div className="text-xs text-zinc-500">{alert.type} • {new Date(alert.timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="text-center py-20 space-y-4">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-8 h-8 text-zinc-300" />
                    </div>
                    <p className="text-zinc-400 text-sm">Quiet in your areas for now.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Settings</h2>

              {/* Locations */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Monitored Locations</h3>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                        <Search className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Search city..." 
                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        value={locationSearch}
                        onChange={(e) => {
                          setLocationSearch(e.target.value);
                          setShowLocationResults(true);
                        }}
                        onFocus={() => setShowLocationResults(true)}
                        onBlur={() => setTimeout(() => setShowLocationResults(false), 200)}
                      />
                      {showLocationResults && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto overscroll-contain">
                          <div className="p-2 border-b border-zinc-50 bg-zinc-50/50 flex items-center justify-between sticky top-0 z-10">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                              {locationSearch ? 'Search Results' : 'All Locations'}
                            </span>
                            <button onClick={() => setShowLocationResults(false)} className="text-zinc-400 hover:text-zinc-600">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {allLocations.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                              <p className="text-xs text-zinc-400">Loading cities...</p>
                            </div>
                          ) : (
                            <>
                              {allLocations
                                .filter(loc => loc.name.toLowerCase().includes(locationSearch.toLowerCase()))
                                .slice(0, 50)
                                .map(loc => (
                                  <button
                                    key={loc.name}
                                    className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm text-zinc-700 border-b border-zinc-50 last:border-none transition-colors"
                                    onClick={() => handleAddLocation(loc.name)}
                                  >
                                    {loc.name}
                                  </button>
                                ))}
                              {allLocations.filter(loc => loc.name.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                                <div className="px-4 py-6 text-center">
                                  <p className="text-xs text-zinc-400 italic">No cities found matching "{locationSearch}"</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {userLocations.map(loc => (
                    <div key={loc.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-100 shadow-sm">
                      <span className="text-sm font-medium text-zinc-700">{loc.name}</span>
                      <button onClick={() => handleDeleteLocation(loc.name)} className="text-zinc-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vibration */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Vibration Profile</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(['short', 'long', 'intense', 'pulse'] as const).map(profile => (
                    <button
                      key={profile}
                      onClick={() => {
                        handleUpdateSettings({ vibration_profile: profile });
                        testVibration(profile);
                      }}
                      className={cn(
                        "p-4 rounded-2xl border-2 text-left transition-all",
                        settings?.vibration_profile === profile 
                          ? "border-emerald-600 bg-emerald-50" 
                          : "border-zinc-100 bg-white hover:border-zinc-200"
                      )}
                    >
                      <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{profile}</div>
                      <div className="text-xs text-zinc-600">Tap to test</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Flashlight */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Visual Alerts</h3>
                <Card className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <Zap className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-900">Flashlight Alerts</div>
                      <div className="text-xs text-zinc-500">Flash camera light during alerts</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleUpdateSettings({ flashlight_enabled: !settings?.flashlight_enabled })}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      settings?.flashlight_enabled ? "bg-emerald-500" : "bg-zinc-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                      settings?.flashlight_enabled ? "left-7" : "left-1"
                    )} />
                  </button>
                </Card>
              </div>

              {/* Night Mode */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Night Mode</h3>
                <Card className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <Moon className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-900">Enable Night Mode</div>
                        <div className="text-xs text-zinc-500">Vibrate only, no screen wake</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleUpdateSettings({ night_mode_enabled: !settings?.night_mode_enabled })}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        settings?.night_mode_enabled ? "bg-emerald-500" : "bg-zinc-200"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                        settings?.night_mode_enabled ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>
                  {settings?.night_mode_enabled && (
                    <div className="flex items-center gap-4 pt-4 border-t border-zinc-50">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Start</label>
                        <input 
                          type="time" 
                          value={settings.night_mode_start} 
                          onChange={(e) => handleUpdateSettings({ night_mode_start: e.target.value })}
                          className="w-full bg-zinc-50 border-none rounded-lg text-sm p-2"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">End</label>
                        <input 
                          type="time" 
                          value={settings.night_mode_end} 
                          onChange={(e) => handleUpdateSettings({ night_mode_end: e.target.value })}
                          className="w-full bg-zinc-50 border-none rounded-lg text-sm p-2"
                        />
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Dev Mode */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Developer Tools</h3>
                <Card className="bg-zinc-50 border-dashed border-2">
                  <p className="text-xs text-zinc-500 mb-3">Test the alert notification and vibration patterns without waiting for real data.</p>
                  <Button 
                    variant="outline" 
                    className="w-full bg-white"
                    onClick={async () => {
                      await fetch('/api/mock-alert', { method: 'POST' });
                      fetchData();
                    }}
                  >
                    Simulate Rocket Alert
                  </Button>
                </Card>
              </div>

              {/* System Info */}
              <div className="space-y-4 pb-8">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">System Alerts</h3>
                <div className="p-4 bg-zinc-100 rounded-2xl space-y-3">
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    QuietAlert does not control official government alerts. To silence or modify system sirens, you must use your device's system settings.
                  </p>
                  <Button variant="outline" className="w-full text-xs py-2">
                    Open System Settings
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="bg-white border-t border-zinc-100 px-6 py-2 flex justify-between items-center sticky bottom-0 z-10">
        <NavItem icon={Home} label="Home" active={step === 'dashboard'} onClick={() => setStep('dashboard')} />
        <NavItem icon={AlertTriangle} label="Alerts" active={step === 'alerts'} onClick={() => setStep('alerts')} />
        <NavItem icon={Settings} label="Settings" active={step === 'settings'} onClick={() => setStep('settings')} />
      </nav>

      {/* Real-time Alert Banner */}
      <AnimatePresence>
        {alerts.length > 0 && (Date.now() - Number(alerts[0].timestamp_utc) < 30000) && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            onViewportEnter={() => setIsFlashing(true)}
            onViewportLeave={() => setIsFlashing(false)}
            className="absolute top-4 left-4 right-4 z-50"
          >
            <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-red-500">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0 animate-pulse text-xl">
                {getAlertEmoji(alerts[0].type)}
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg leading-tight">Alert: {alerts[0].location}</div>
                <div className="text-xs text-white/80">{alerts[0].type}</div>
              </div>
              <button onClick={() => fetchData()} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
