package sqlstore

import "strings"

func Rebind(dialect, query string) string {
	if dialect != DialectPostgres {
		return query
	}
	var out strings.Builder
	arg := 1
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			out.WriteString("$")
			out.WriteString(intToString(arg))
			arg++
			continue
		}
		out.WriteByte(query[i])
	}
	return out.String()
}

func intToString(value int) string {
	if value == 0 {
		return "0"
	}
	buf := [16]byte{}
	i := len(buf)
	for value > 0 {
		i--
		buf[i] = byte('0' + value%10)
		value /= 10
	}
	return string(buf[i:])
}
