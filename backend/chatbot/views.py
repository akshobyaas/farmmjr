from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .matcher import sanitize_message, match_intent
from .serializers import ChatMessageSerializer
from .throttles import ChatRateThrottle


class ChatMessageView(APIView):
    """
    Phase 16 -- basic keyword-matching chatbot. Takes a farmer's free-text
    message, sanitizes it, matches it against the curated FAQ_ENTRIES in
    faq.py, and returns either a recognized answer or the standard
    fallback ("I'm not sure — would you like to ask our expert instead?"),
    which bridges into Phase 17's expert advisory feature.
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

        reply, intent, recognized = match_intent(message)
        return Response(
            {"reply": reply, "recognized": recognized, "intent": intent},
            status=status.HTTP_200_OK,
        )
