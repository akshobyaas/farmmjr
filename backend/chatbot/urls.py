from django.urls import path
from .views import ChatMessageView

urlpatterns = [
    path('chatbot/message/', ChatMessageView.as_view(), name='chatbot-message'),
]
