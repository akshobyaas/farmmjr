from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .gemini_chat import generate_chat_reply, MAX_HISTORY_TURNS
from .matcher import sanitize_message, match_intent
from .serializers import ChatMessageSerializer
from .throttles import ChatRateThrottle


class ChatMessageView(APIView):
    """
    Kannada Voice Assistant -- takes a farmer's free-text message (plus
    their conversation history and active UI language) and tries a
    Gemini-backed conversational reply first (generate_chat_reply,
    chatbot/gemini_chat.py). Any failure there (blank key, network error,
    bad response -- generate_chat_reply never raises) falls through to the
    original Phase 16 keyword-matching behavior against FAQ_ENTRIES in
    faq.py, including its own fallback ("I'm not sure — would you like to
    ask our expert instead?") that bridges into the Advisory feature.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ChatRateThrottle]

    def post(self, request):
        serializer = ChatMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = sanitize_message(serializer.validated_data["message"])
        if not message:
            return Response(
                {"detail": "Please type a message."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        history = serializer.validated_data["history"][-MAX_HISTORY_TURNS:]
        ui_language = serializer.validated_data["ui_language"]

        ai_reply = generate_chat_reply(message, history, ui_language)
        if ai_reply is not None:
            return Response(
                {"reply": ai_reply, "recognized": True, "intent": None, "source": "ai"},
                status=status.HTTP_200_OK,
            )

        reply, intent, recognized = match_intent(message)
        return Response(
            {"reply": reply, "recognized": recognized, "intent": intent, "source": "faq"},
            status=status.HTTP_200_OK,
        )
