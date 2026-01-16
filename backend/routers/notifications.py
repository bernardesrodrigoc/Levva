"""Notification routes."""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from notification_service import (
    get_user_notifications,
    mark_notification_read,
    mark_all_notifications_read,
    get_unread_count,
    delete_notification
)

router = APIRouter()


@router.get("")
async def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    user_id: str = Depends(get_current_user_id)
):
    """Get user notifications."""
    notifications = await get_user_notifications(user_id, unread_only, limit)
    return notifications


@router.get("/unread-count")
async def get_notifications_unread_count(user_id: str = Depends(get_current_user_id)):
    """Get count of unread notifications."""
    count = await get_unread_count(user_id)
    return {"count": count}


@router.post("/{notification_id}/read")
async def mark_notification_as_read(notification_id: str, user_id: str = Depends(get_current_user_id)):
    """Mark a notification as read."""
    success = await mark_notification_read(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return {"message": "Notificação marcada como lida"}


@router.post("/read-all")
async def mark_all_as_read(user_id: str = Depends(get_current_user_id)):
    """Mark all notifications as read."""
    count = await mark_all_notifications_read(user_id)
    return {"message": f"{count} notificações marcadas como lidas", "count": count}


@router.delete("/{notification_id}")
async def delete_user_notification(notification_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a notification."""
    success = await delete_notification(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return {"message": "Notificação excluída"}
