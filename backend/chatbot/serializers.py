from rest_framework import serializers
from .matcher import MAX_MESSAGE_LENGTH


class ChatMessageSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=MAX_MESSAGE_LENGTH,
        allow_blank=False,
        trim_whitespace=True,
    )
