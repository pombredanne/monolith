import json

from cornice import Service
from colander import MappingSchema, SchemaNode, Date, Seq
from pyes.exceptions import ElasticSearchException


class ElasticSearchQuery(MappingSchema):
    start = SchemaNode(Date(), location='body', type='datetime.datetime')
    end = SchemaNode(Date(), location='body', type='datetime.datetime')
    names = SchemaNode(Seq(), location='body')


es = Service(
    name='elasticsearch',
    path='/',
    description="Raw access to ES")


def valid_json_body(request):
    # XXX put this back in cornice.validators
    try:
        body = json.loads(request.body)
        request.validated['body'] = body
    except:
        request.errors.add('body', description='malformed json')


@es.get(validators=(valid_json_body,))
def query_es(request):
    try:
        return request.es.search(request.validated['body'], 'monolith')
    except ElasticSearchException as e:
        request.response.status = e.result['status']
        return e.result['error']
