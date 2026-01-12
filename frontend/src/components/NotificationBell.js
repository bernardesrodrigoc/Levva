import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Trash2, Package, Truck, CreditCard, MessageCircle, Shield, AlertTriangle, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icon mapping for notification types
const getNotificationIcon = (type) => {
  const icons = {
    new_match_suggestion: <Package className="w-4 h-4 text-jungle" />,
    match_created: <Package className="w-4 h-4 text-blue-500" />,
    payment_approved: <CreditCard className="w-4 h-4 text-green-500" />,
    payment_failed: <CreditCard className="w-4 h-4 text-red-500" />,
    pickup_confirmed: <Truck className="w-4 h-4 text-jungle" />,
    delivery_in_transit: <Truck className="w-4 h-4 text-blue-500" />,
    delivery_completed: <Check className="w-4 h-4 text-green-500" />,
    delivery_problem: <AlertTriangle className="w-4 h-4 text-red-500" />,
    new_message: <MessageCircle className="w-4 h-4 text-blue-500" />,
    verification_approved: <Shield className="w-4 h-4 text-green-500" />,
    verification_rejected: <Shield className="w-4 h-4 text-red-500" />,
    dispute_opened: <AlertTriangle className="w-4 h-4 text-orange-500" />,
    dispute_resolved: <Check className="w-4 h-4 text-green-500" />,
    trust_level_up: <TrendingUp className="w-4 h-4 text-purple-500" />,
  };
  return icons[type] || <Bell className="w-4 h-4 text-gray-500" />;
};

// Priority colors
const getPriorityColor = (priority) => {
  const colors = {
    critical: 'bg-red-100 border-red-300',
    high: 'bg-orange-50 border-orange-200',
    medium: 'bg-blue-50 border-blue-200',
    low: 'bg-gray-50 border-gray-200',
  };
  return colors[priority] || 'bg-gray-50';
};

const NotificationItem = ({ notification, onMarkRead, onDelete, onClick }) => {
  const timeAgo = (date) => {
    const now = new Date();
    const notifDate = new Date(date);
    const diffMs = now - notifDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  return (
    <div
      className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors ${
        !notification.read ? 'bg-jungle/5' : ''
      }`}
      onClick={() => onClick(notification)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {getNotificationIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-600'}`}>
              {notification.title}
            </p>
            <span className="text-xs text-muted-foreground ml-2">
              {timeAgo(notification.created_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        </div>
        {!notification.read && (
          <div className="flex-shrink-0">
            <div className="w-2 h-2 bg-jungle rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
};

const NotificationBell = ({ onNotificationClick }) => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [notifResponse, countResponse] = await Promise.all([
        axios.get(`${API}/notifications?limit=20`, { headers }),
        axios.get(`${API}/notifications/unread-count`, { headers })
      ]);
      
      setNotifications(notifResponse.data);
      setUnreadCount(countResponse.data.count);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [token]);

  // Fetch notifications on mount and periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = async (notificationId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/notifications/${notificationId}/read`, {}, { headers });
      
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/notifications/read-all`, {}, { headers });
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (notificationId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API}/notifications/${notificationId}`, { headers });
      
      const deletedNotif = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (deletedNotif && !deletedNotif.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      handleMarkRead(notification.id);
    }
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
    setIsOpen(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs"
              data-testid="notification-badge"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={handleMarkAllRead}
            >
              Marcar todas como lidas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma notificação</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
              onClick={handleNotificationClick}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
