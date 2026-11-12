with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('app.js?v=7', 'app.js?v=8')
with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
