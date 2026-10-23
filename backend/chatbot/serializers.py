from rest_framework import serializers
from .matcher import MAX_MESSAGE_LENGTH


class ChatMessageSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=MAX_MESSAGE_LENGTH,
        allow_blank=False,
        trim_whitespace=True,
    )
    # Kannada Voice Assistant -- both optional so an older cached frontend
    # bundle that doesn't send them yet still works. `history` entries are
    # loosely-typed dicts; a malformed one is dropped in
    # chatbot.gemini_chat._history_to_contents rather than rejected here,
    # so one bad entry never blocks the farmer's next message.
    history = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    ui_language = serializers.ChoiceField(choices=["en", "kn", "hi"], required=False, default="en")
