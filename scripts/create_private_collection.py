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
        default_factory=lambda: os.environ.get('API_KEY'),
        metadata={'display_name': 'Outline API Key'},
    )
    api_url: str = field(
        default_factory=lambda: os.environ.get('API_URL'),
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
    c = Client(**{k: v for k,v in vars(args).items() if v is not None})

    response = c.list_users(
        limit=100,
    )
    users = [
        {k: user[k] for k in {'id', 'name'}}
        for user in response
        if user['isSuspended'] is False
    ]
    print(f'Found {len(users)} users')

    response = c.list_collections(
        limit=100,
    )
    prefix = 'Private - '
    collections = {c['name'] for c in response if prefix in c['name']}

    for user in users:
        name = user['name']
        collection_name = prefix + name
        if collection_name in collections:
            print(f'Skipping creation of collection for {name}')
            continue

        response = c.create_collections(
            name=collection_name,
            description=f'Private collection for {name}',
            private=True,
        )
        collection = response['id']
        print(f'Created collection {collection} for {name}')

        response = c.add_user_to_collection(
            id=collection,
            userId=user['id'],
            permission='read_write',
        )
        print(f'User {name} ({user["id"]}) added with read_write to {collection}')

if __name__ == '__main__':
    main()
