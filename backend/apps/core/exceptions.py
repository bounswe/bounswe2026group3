from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied
from rest_framework.views import exception_handler
from django.utils import timezone

class ApplicationError(APIException):
    status_code = 400
    default_detail = 'There was an error processing your request.'
    default_code = 'application_error'

    def __init__(self, detail=None, code=None, status_code=None):
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=detail, code=code)



def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:

        if isinstance(exc, NotAuthenticated):
            code = 'UNAUTHORIZED'
            message = 'Valid JWT token required.'
        elif isinstance(exc, PermissionDenied):
            code = 'FORBIDDEN'
            message = 'You do not have permission for this action.'
        else:
            code = getattr(exc, 'default_code', 'ERROR')
            message = str(exc.detail)

        response.data = {
            'error': {
                'code': code,
                'detail': message,
                'timestamp': timezone.now().isoformat(),
            }
        }

    return response