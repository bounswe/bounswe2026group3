from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


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
        response.data = {
            'error': {
                'code': getattr(exc, 'default_code', 'error'),
                'detail': response.data,
            }
        }

    return response