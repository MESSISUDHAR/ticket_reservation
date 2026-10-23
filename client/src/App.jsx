import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import EventListPage from './pages/EventListPage';
import EventDetailPage from './pages/EventDetailPage';
import CheckoutPage from './pages/CheckoutPage';
import OrganizerDashboard from './pages/OrganizerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AuthPage from './pages/AuthPage';
import MyOrdersModal from './pages/MyOrdersModal';

function MainLayout() {
  const { user, activeReservation, isOrganizer, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState('events'); // 'events', 'event-detail', 'checkout', 'organizer', 'admin'
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [checkoutReservationId, setCheckoutReservationId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMyOrders, setShowMyOrders] = useState(false);

  // Navigate to Event Detail
  const handleSelectEvent = (id) => {
    setSelectedEventId(id);
    setCurrentView('event-detail');
  };

  // When a reservation hold is successfully created
  const handleReservationCreated = (reservation) => {
    setCheckoutReservationId(reservation.id);
    setCurrentView('checkout');
  };

  // If user clicks active hold banner in navbar
  const handleGoToCheckout = () => {
    if (activeReservation) {
      setCheckoutReservationId(activeReservation.id);
      setCurrentView('checkout');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) => {
          if (view === 'checkout') {
            handleGoToCheckout();
          } else {
            setCurrentView(view);
          }
        }}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenMyOrders={() => setShowMyOrders(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {currentView === 'events' && (
          <EventListPage onSelectEvent={handleSelectEvent} />
        )}

        {currentView === 'event-detail' && (
          <EventDetailPage
            eventId={selectedEventId}
            onBack={() => setCurrentView('events')}
            onReservationCreated={handleReservationCreated}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        )}

        {currentView === 'checkout' && (
          <CheckoutPage
            reservationId={checkoutReservationId || activeReservation?.id}
            onBack={() => setCurrentView('events')}
            onSuccessOrder={() => {
              // Stay on confirmation screen or allow return to events
            }}
          />
        )}

        {currentView === 'organizer' && (
          isOrganizer ? (
            <OrganizerDashboard />
          ) : (
            <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Organizer Access Required</h2>
              <p className="text-xs text-slate-500">
                You must be logged in as an Organizer or Admin to access this dashboard.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
              >
                Switch Account
              </button>
            </div>
          )
        )}

        {currentView === 'admin' && (
          isAdmin ? (
            <AdminDashboard />
          ) : (
            <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Admin Access Required</h2>
              <p className="text-xs text-slate-500">
                You must have Admin privileges to access platform settings and users directory.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold"
              >
                Switch Account
              </button>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-800">EventHub MVP</span> — Simple Multi-Tenant Event & Ticket Reservation System
          </div>
          <div className="flex items-center space-x-4 text-[11px] text-slate-400">
            <span>PostgreSQL Concurrency (SELECT FOR UPDATE)</span>
            <span>•</span>
            <span>Upstash Redis Cache</span>
            <span>•</span>
            <span>10-Minute Hold Expiry Worker</span>
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      <AuthPage
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <MyOrdersModal
        isOpen={showMyOrders}
        onClose={() => setShowMyOrders(false)}
        onSelectEvent={(id) => {
          setShowMyOrders(false);
          handleSelectEvent(id);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
