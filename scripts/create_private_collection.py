#!/usr/bin/env python3

import argparse
import os
import requests

API_KEY = os.environ['API_KEY']
API_URL = os.environ['API_URL']
TEMPLATE_ID = os.environ['TEMPLATE_ID']
COLLECTION_ID = os.environ['COLLECTION_ID']
DOCUMENT_ID = os.environ['DOCUMENT_ID']
PARENT_ID = os.environ['PARENT_ID']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        'user',
        help='Email address of user to create private collection for.',
        type=str,
    )
    args = parser.parse_args()
    user = args.user
    resp = requests.post(
        url=API_URL + '/api/documents.duplicate',
        json={
            'title': user,
            'collectionId': COLLECTION_ID,
            'documentId': DOCUMENT_ID,
            'parentDocumentId': PARENT_ID,
        },
        headers={
            'Authorization': 'Bearer ' + API_KEY,
            'Content-Type': 'application/json',
        },
    )


if __name__ == '__main__':
    main()
