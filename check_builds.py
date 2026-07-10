import urllib.request, json
req = urllib.request.Request('https://api.codemagic.io/builds', headers={'x-auth-token': 'eVcTvUhSmLzq_lOAFcCw_8T2PVSC6LOoZNIalWfx1y8'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        builds = data.get('builds', [])
        if not builds:
            print('No builds found.')
        else:
            for build in builds[:3]:
                print('Build:', build.get('startedAt'), 'Status:', build.get('status'))
                for art in build.get('artefacts', []):
                    size_mb = art.get('size', 0) / (1024 * 1024)
                    name = art.get('name')
                    print(f'  Artifact: {name} - {size_mb:.2f} MB')
                print('-' * 20)
except Exception as e:
    print('Error:', e)
