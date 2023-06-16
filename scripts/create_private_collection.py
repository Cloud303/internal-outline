#!/usr/bin/env python3

import argparse
import functools
import os
import requests
from dataclasses import dataclass
from dataclasses import field
from getpass import getpass


@dataclass
class Client():
    api_key: str = field(
        default=os.environ.get('API_KEY'),
        metadata={'display_name': 'Outline API Key'},
    )
    api_url: str = field(
        default=os.environ.get('API_URL'),
        metadata={'display_name': 'Outline URL'},
    )

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = getpass('API Key: ')
        if self.api_url is None:
            self.api_url = input('API URL: ')
        missing_args = ', '.join({
            k: v for k, v
            in self.__dict__.items()
            if v is None
        }.keys())
        if missing_args:
            raise SystemExit(f'Missing values for: {missing_args}')

    def request(endpoint):
        def outer(fn):
            @functools.wraps(fn)
            def inner(self, **kwargs):
                response = requests.post(
                    url=self.api_url + endpoint,
                    headers={
                        'Authorization': 'Bearer ' + self.api_key,
                        'Content-Type': 'application/json',
                    },
                    json=kwargs,
                )
                if response.status_code == 200:
                    return response.json()['data']
                else:
                    raise SystemExit(f'Failed to fetch data: {response.text}')
            return inner
        return outer

    @request('/api/users.list')
    def list_users(self, **kwargs):
        return

    @request('/api/collections.list')
    def list_collections(self, **kwargs):
        return

    @request('/api/collections.create')
    def create_collections(self, **kwargs):
        return

    @request('/api/collections.add_user')
    def add_user_to_collection(self, **kwargs):
        return

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '-u', '--api-url',
        help='URL of the Outline instance.',
    )

    args = parser.parse_args()
    c = Client(api_url=args.api_url)

    response = c.list_users()
    users = [
        {k: user[k] for k in {'id', 'name'}}
        for user in response
        if user['isSuspended'] is False
    ]

    response = c.list_collections()
    collections = {c['name'] for c in response}

    for user in users:
        name = user['name']
        collection_name = f'Private - {name}'
        if collection_name in collections:
            continue

        response = c.create_collections(
            name=collection_name,
            description=f'Private collection for {name}',
            private=True,
        )
        collection = response['id']

        response = c.add_user_to_collection(
            id=collection,
            userId=user['id'],
            permission='read_write',
        )

if __name__ == '__main__':
    main()
